// pdf-service/server.js
const amqp = require('amqplib');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const CircuitBreaker = require('../utils/circuit-breaker');

const outputDir = './output';
const NUM_CONSUMERS = 12;

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

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

const pdfBreaker = new CircuitBreaker(
  async (text, pdfPath) => {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument();
        const writeStream = fs.createWriteStream(pdfPath);
        
        writeStream.on('error', reject);
        writeStream.on('finish', () => resolve(pdfPath));
        
        doc.pipe(writeStream);
        doc.font('font/Roboto-Regular.ttf').fontSize(14).text(text, 100, 100);
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  },
  {
    failureThreshold: 5,
    resetTimeout: 20000,
    halfOpenSuccess: 2,
    monitorInterval: 5000
  }
);

async function createPDF(text, pdfFilename) {
  const pdfPath = path.join(outputDir, pdfFilename);
  
  try {
    await retryWithBackoff(async () => {
      return await pdfBreaker.exec(text, pdfPath);
    });
    return pdfFilename;
  } catch (error) {
    console.error(`[PDF] Error creating PDF: ${error.message}`);
    throw error;
  }
}

async function createPDFConsumer(connection) {
  const channel = await connection.createChannel();
  
  await channel.assertQueue('pdf_queue', { durable: true });
  await channel.assertQueue('pdf-result-queue', { durable: true });
  await channel.assertQueue('pdf_error_queue', { durable: true });
  await channel.assertQueue('pdf_dlq', { durable: true });

  channel.prefetch(1);

  channel.consume('pdf_queue', async (msg) => {
    if (msg !== null) {
      const startTime = Date.now();
      console.log(`[PDF] Starting processing at ${new Date().toISOString()}`);
      
      try {
        const { translatedText, imagePath } = JSON.parse(msg.content.toString());
        const pdfFilename = `output-${Date.now()}.pdf`;
        
        console.log(`Circuit Breaker state: ${pdfBreaker.getState()}`);
        
        try {
          await createPDF(translatedText, pdfFilename);
          const processingTime = Date.now() - startTime;

          channel.sendToQueue('pdf-result-queue', 
            Buffer.from(JSON.stringify({ pdfFilename, imagePath })), 
            { 
              persistent: true,
              headers: {
                processingTime,
                timestamp: new Date().toISOString()
              }
            }
          );

          channel.ack(msg);
          
        } catch (circuitError) {
          if (pdfBreaker.getState() === 'OPEN') {
            console.log('[PDF] Circuit Breaker OPEN, sending to error queue');
            channel.sendToQueue('pdf_error_queue', msg.content, {
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
        console.error(`[PDF] Error processing PDF: ${error.message}`);
        
        if (msg.fields.redelivered) {
          console.log('[PDF] Message failed after retry, moving to DLQ');
          channel.sendToQueue('pdf_dlq', msg.content, {
            persistent: true,
            headers: { 
              error: error.message,
              timestamp: new Date().toISOString(),
              processingTime: Date.now() - startTime
            }
          });
          channel.ack(msg);
        } else {
          console.log('[PDF] First failure, retrying message');
          channel.nack(msg, false, true);
        }
      }
    }
  }, { 
    consumerTag: `pdf-consumer-${Math.random().toString(36).substr(2, 9)}` 
  });
}

async function handleErrorQueue(connection) {
  const channel = await connection.createChannel();
  await channel.assertQueue('pdf_error_queue', { durable: true });

  channel.consume('pdf_error_queue', async (msg) => {
    if (msg !== null) {
      const content = JSON.parse(msg.content.toString());
      const error = msg.properties.headers.error;
      
      console.log(`[PDF Error Queue] Processing message:`, {
        content,
        error,
        timestamp: new Date().toISOString()
      });

      if (pdfBreaker.getState() === 'CLOSED') {
        channel.sendToQueue('pdf_queue', msg.content, {
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
  await channel.assertQueue('pdf_dlq', { durable: true });

  channel.consume('pdf_dlq', async (msg) => {
    if (msg !== null) {
      const content = JSON.parse(msg.content.toString());
      const headers = msg.properties.headers;
      
      console.log(`[PDF DLQ] Permanently failed message:`, {
        content,
        error: headers.error,
        timestamp: headers.timestamp,
        processingTime: headers.processingTime
      });

      channel.ack(msg);
    }
  });
}

async function start() {
  try {
    const connection = await amqp.connect('amqp://localhost');
    console.log("Starting PDF Service with Circuit Breaker...");

    const consumers = [];
    for (let i = 0; i < NUM_CONSUMERS; i++) {
      consumers.push(createPDFConsumer(connection));
    }

    await handleErrorQueue(connection);
    await handleDLQ(connection);

    await Promise.all(consumers);
    console.log(`Started ${NUM_CONSUMERS} competing PDF consumers with Circuit Breaker`);

  } catch (error) {
    console.error('Error starting PDF service:', error);
    process.exit(1);
  }
}

start().catch(console.error);