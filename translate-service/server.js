// translate-service/server.js
const amqp = require('amqplib');
const translator = require("open-google-translator");
const CircuitBreaker = require('../utils/circuit-breaker');
const CacheService = require('../utils/cache');

const NUM_CONSUMERS = 12;
const cache = new CacheService({
  defaultTTL: 7 * 24 * 3600
});

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

const translationBreaker = new CircuitBreaker(
  async (text) => {
    return new Promise((resolve, reject) => {
      translator
        .TranslateLanguageData({
          listOfWordsToTranslate: [text],
          fromLanguage: "en",
          toLanguage: "vi",
        })
        .then((data) => resolve(data[0].translation))
        .catch((err) => reject(err));
    });
  },
  {
    failureThreshold: 5,
    resetTimeout: 30000,
    halfOpenSuccess: 2,
    monitorInterval: 5000
  }
);

async function translateText(text) {
  try {
    const translationKey = cache.generateKey({ 
      type: 'translation', 
      text: text.trim() 
    });
    
    let translatedText = await cache.get(translationKey);
    let isCached = false;
    
    if (translatedText) {
      console.log(`[Translation] Cache hit for text length: ${text.length}`);
      isCached = true;
    } else {
      console.log(`[Translation] Cache miss for text length: ${text.length}`);
      translatedText = await retryWithBackoff(async () => {
        return await translationBreaker.exec(text);
      });
      
      if (translatedText) {
        await cache.set(translationKey, translatedText);
      }
    }
    
    return { translatedText, isCached };
  } catch (error) {
    console.error(`[Translation] Error in translateText: ${error.message}`);
    throw error;
  }
}

async function createTranslateConsumer(connection) {
  const channel = await connection.createChannel();
  
  await channel.assertQueue('translation_queue', { durable: true });
  await channel.assertQueue('pdf_queue', { durable: true });
  await channel.assertQueue('translation_error_queue', { durable: true });
  await channel.assertQueue('translation_dlq', { durable: true });

  channel.prefetch(1);

  channel.consume('translation_queue', async (msg) => {
    if (msg !== null) {
      const startTime = Date.now();
      console.log(`[Translation] Starting processing at ${new Date().toISOString()}`);
      
      try {
        const { text, imagePath } = JSON.parse(msg.content.toString());
        console.log(`Circuit Breaker state: ${translationBreaker.getState()}`);

        try {
          const { translatedText, isCached } = await translateText(text);
          const processingTime = Date.now() - startTime;
          
          if (!translatedText) {
            throw new Error('Translation failed to produce text');
          }

          channel.sendToQueue('pdf_queue', 
            Buffer.from(JSON.stringify({ translatedText, imagePath })), 
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
          if (translationBreaker.getState() === 'OPEN') {
            console.log('[Translation] Circuit Breaker OPEN, sending to error queue');
            channel.sendToQueue('translation_error_queue', msg.content, {
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
        console.error(`[Translation] Error processing text: ${error.message}`);
        
        if (msg.fields.redelivered) {
          console.log('[Translation] Message failed after retry, moving to DLQ');
          channel.sendToQueue('translation_dlq', msg.content, {
            persistent: true,
            headers: { 
              error: error.message,
              timestamp: new Date().toISOString(),
              processingTime: Date.now() - startTime
            }
          });
          channel.ack(msg);
        } else {
          console.log('[Translation] First failure, retrying message');
          channel.nack(msg, false, true);
        }
      }
    }
  }, { 
    consumerTag: `translate-consumer-${Math.random().toString(36).substr(2, 9)}` 
  });
}

async function handleErrorQueue(connection) {
  const channel = await connection.createChannel();
  await channel.assertQueue('translation_error_queue', { durable: true });

  channel.consume('translation_error_queue', async (msg) => {
    if (msg !== null) {
      const content = JSON.parse(msg.content.toString());
      const error = msg.properties.headers.error;
      
      console.log(`[Translation Error Queue] Processing message:`, {
        content,
        error,
        timestamp: new Date().toISOString()
      });

      if (translationBreaker.getState() === 'CLOSED') {
        channel.sendToQueue('translation_queue', msg.content, {
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
  await channel.assertQueue('translation_dlq', { durable: true });

  channel.consume('translation_dlq', async (msg) => {
    if (msg !== null) {
      const content = JSON.parse(msg.content.toString());
      const headers = msg.properties.headers;
      
      console.log(`[Translation DLQ] Permanently failed message:`, {
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
    console.log("Starting Translation Service with Circuit Breaker...");

    const consumers = [];
    for (let i = 0; i < NUM_CONSUMERS; i++) {
      consumers.push(createTranslateConsumer(connection));
    }

    await handleErrorQueue(connection);
    await handleDLQ(connection);

    await Promise.all(consumers);
    console.log(`Started ${NUM_CONSUMERS} competing translation consumers with Circuit Breaker`);

  } catch (error) {
    console.error('Error starting Translation service:', error);
    process.exit(1);
  }
}

start().catch(console.error);