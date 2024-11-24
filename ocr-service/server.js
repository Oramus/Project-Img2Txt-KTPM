// ocr-service/server.js
const path = require('path');
const amqp = require('amqplib');
const tesseract = require('node-tesseract-ocr');  
const fs = require('fs');
const CircuitBreaker = require('../utils/circuit-breaker');
const CacheService = require('../utils/cache');

const dataDir = path.resolve(__dirname, '../data');
const NUM_CONSUMERS = 12;

const cache = new CacheService({
  defaultTTL: 7 * 24 * 3600
});

const ocrBreaker = new CircuitBreaker(
  async (imagePath) => {
    return await tesseract.recognize(imagePath, { 
      lang: 'eng',
      oem: 1,
      psm: 3,
    });
  },
  {
    failureThreshold: 5,     // Số lần lỗi tối đa trước khi mở circuit
    resetTimeout: 20000,     // Thời gian chờ trước khi thử lại (ms)  
    halfOpenSuccess: 2,      // Số lần success cần để đóng lại circuit
    monitorInterval: 5000    // Chu kỳ kiểm tra trạng thái (ms)
  }
);


async function retryWithBackoff(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      const delay = Math.pow(2, i) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

async function processImage(imagePath) {
  try {
    const imageBuffer = fs.readFileSync(imagePath);
    const imageKey = cache.generateKey({ 
      type: 'ocr', 
      content: imageBuffer 
    });
    
    let text = await cache.get(imageKey);
    let isCached = false;
    
    if (text) {
      console.log(`[OCR] Cache hit for ${imagePath}`);
      isCached = true;
    } else {
      console.log(`[OCR] Cache miss for ${imagePath}`);
      text = await retryWithBackoff(async () => {
        return await ocrBreaker.exec(imagePath);
      });
      
      if (text) {
        await cache.set(imageKey, text);
      }
    }
    
    return { text, isCached };
  } catch (error) {
    console.error(`[OCR] Error in processImage: ${error.message}`);
    throw error;
  }
}

async function createConsumer(connection) {
  const channel = await connection.createChannel();
  
  await channel.assertQueue('ocr_queue', { durable: true });
  await channel.assertQueue('translation_queue', { durable: true });
  await channel.assertQueue('ocr_error_queue', { durable: true });
  await channel.assertQueue('ocr_dlq', { durable: true });

  channel.prefetch(1);

  channel.consume('ocr_queue', async (msg) => {
    if (msg !== null) {
      const startTime = Date.now();
      console.log(`[OCR] Starting processing at ${new Date().toISOString()}`);
      
      try {
        const { imagePath } = JSON.parse(msg.content.toString());
        const absoluteImagePath = path.join(dataDir, path.basename(imagePath));

        if (!fs.existsSync(absoluteImagePath)) {
          throw new Error(`Image file not found: ${absoluteImagePath}`);
        }

        console.log(`Circuit Breaker state: ${ocrBreaker.getState()}`);
        
        try {
          const { text, isCached } = await processImage(absoluteImagePath);
          const processingTime = Date.now() - startTime;
          
          if (!text) {
            throw new Error('OCR processing failed to produce text');
          }

          channel.sendToQueue('translation_queue', 
            Buffer.from(JSON.stringify({ text, imagePath })), 
            { 
              persistent: true,
              headers: {
                processingTime,
                timestamp: new Date().toISOString(),
                cached: isCached
              }
            }
          );

          channel.ack(msg);
          
        } catch (circuitError) {
          if (ocrBreaker.getState() === 'OPEN') {
            console.log('[OCR] Circuit Breaker OPEN, sending to error queue');
            channel.sendToQueue('ocr_error_queue', msg.content, {
              persistent: true,
              headers: { 
                error: 'Circuit Breaker OPEN',
                timestamp: new Date().toISOString()
              }
            });
            channel.ack(msg);
            return;
          }
          throw circuitError;
        }

      } catch (error) {
        console.error(`[OCR] Error processing image: ${error.message}`);
        
        if (msg.fields.redelivered) {
          console.log('[OCR] Message failed after retry, moving to DLQ');
          channel.sendToQueue('ocr_dlq', msg.content, {
            persistent: true,
            headers: { 
              error: error.message,
              timestamp: new Date().toISOString(),
              processingTime: Date.now() - startTime
            }
          });
          channel.ack(msg);
        } else {
          console.log('[OCR] First failure, retrying message');
          channel.nack(msg, false, true);
        }
      }
    }
  }, { 
    consumerTag: `ocr-consumer-${Math.random().toString(36).substr(2, 9)}` 
  });
}

async function handleErrorQueue(connection) {
  const channel = await connection.createChannel();
  await channel.assertQueue('ocr_error_queue', { durable: true });

  channel.consume('ocr_error_queue', async (msg) => {
    if (msg !== null) {
      const content = JSON.parse(msg.content.toString());
      const error = msg.properties.headers.error;
      
      console.log(`[OCR Error Queue] Processing message:`, {
        content,
        error,
        timestamp: new Date().toISOString()
      });

      if (ocrBreaker.getState() === 'CLOSED') {
        channel.sendToQueue('ocr_queue', msg.content, {
          persistent: true,
          headers: { retriedFrom: 'error_queue' }
        });
      }

      channel.ack(msg);
    }
  });
}

async function handleDLQ(connection) {
  const channel = await connection.createChannel();
  await channel.assertQueue('ocr_dlq', { durable: true });

  channel.consume('ocr_dlq', async (msg) => {
    if (msg !== null) {
      const content = JSON.parse(msg.content.toString());
      const headers = msg.properties.headers;
      
      console.log(`[OCR DLQ] Permanently failed message:`, {
        content,
        error: headers.error,
        timestamp: headers.timestamp,
        processingTime: headers.processingTime
      });

      channel.ack(msg);
    }
  });
}

async function startCompetingConsumers() {
  try {
    const connection = await amqp.connect('amqp://localhost');
    console.log("Starting OCR Service with Circuit Breaker...");

    const consumers = [];
    for (let i = 0; i < NUM_CONSUMERS; i++) {
      consumers.push(createConsumer(connection));
    }

    await handleErrorQueue(connection);
    await handleDLQ(connection);

    await Promise.all(consumers);
    console.log(`Started ${NUM_CONSUMERS} competing OCR consumers with Circuit Breaker`);

  } catch (error) {
    console.error('Error starting OCR service:', error);
    process.exit(1);
  }
}

startCompetingConsumers().catch(console.error);