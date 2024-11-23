// translate-service/server.js
const amqp = require('amqplib');
const translator = require("open-google-translator");
const CircuitBreaker = require('../utils/circuit-breaker');
const CacheService = require('../utils/cache');

const NUM_CONSUMERS = 2;
const cache = new CacheService({
  defaultTTL: 7 * 24 * 3600
});

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
    failureThreshold: 3,     // Sau 3 lần lỗi sẽ mở circuit
    resetTimeout: 30000,     // Thời gian reset 30 giây
    halfOpenSuccess: 2,      // Cần 2 lần success để đóng lại
    monitorInterval: 5000    // Kiểm tra mỗi 5 giây
  }
);

async function translateText(text) {
  try {
    // Generate cache key based on input text
    const translationKey = cache.generateKey({ 
      type: 'translation', 
      text: text.trim() 
    });
    
    // Try to get from cache
    let translatedText = await cache.get(translationKey);
    let isCached = false;
    
    if (translatedText) {
      console.log(`[Translation] Cache hit for text length: ${text.length}`);
      isCached = true;
    } else {
      console.log(`[Translation] Cache miss for text length: ${text.length}`);
      // Perform translation if not in cache
      translatedText = await translationBreaker.exec(text);
      
      // Store result in cache only if translation was successful
      if (translatedText) {
        await cache.set(translationKey, translatedText);
      }
    }
    
    return { translatedText, isCached };
  } catch (error) {
    console.error(`[Translation] Error in translateText: ${error.message}`);
    throw error; // Re-throw to be handled by the consumer
  }
}

async function createTranslateConsumer(connection) {
  const channel = await connection.createChannel();
  
  await channel.assertQueue('translation_queue', { durable: true });
  await channel.assertQueue('pdf_queue', { durable: true });
  await channel.assertQueue('error_queue', { durable: true });

  channel.consume('translation_queue', async (msg) => {
    if (msg !== null) {
      const startTime = Date.now();
      
      try {
        const { text, imagePath } = JSON.parse(msg.content.toString());
        console.log(`Circuit Breaker state: ${translationBreaker.getState()}`);

        try {
          const { translatedText, isCached } = await translateText(text);
          
          if (!translatedText) {
            throw new Error('Translation failed to produce text');
          }

          channel.sendToQueue('pdf_queue', Buffer.from(JSON.stringify({ 
            translatedText, 
            imagePath 
          })), { 
            persistent: true,
            headers: {
              processingTime: Date.now() - startTime,
              timestamp: new Date().toISOString(),
              cached: isCached
            }
          });

          channel.ack(msg);
          
        } catch (circuitError) {
          if (translationBreaker.getState() === 'OPEN') {
            channel.sendToQueue('error_queue', msg.content, {
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
        console.error(`Translation error: ${error}`);
        
        if (msg.fields.redelivered) {
          channel.sendToQueue('error_queue', msg.content, {
            persistent: true,
            headers: { 
              error: error.message,
              timestamp: new Date().toISOString(),
              processingTime: Date.now() - startTime
            }
          });
          channel.ack(msg);
        } else {
          channel.nack(msg, false, true);
        }
      }
    }
  }, { 
    consumerTag: `translate-consumer-${Math.random().toString(36).substr(2, 9)}` 
  });
}

async function startTranslateCompetingConsumers() {
  try {
    const connection = await amqp.connect('amqp://localhost');
    console.log("Starting Competing Consumers for Translation Service...");

    const consumers = [];
    for (let i = 0; i < NUM_CONSUMERS; i++) {
      consumers.push(createTranslateConsumer(connection));
    }

    await Promise.all(consumers);
    console.log(`Started ${NUM_CONSUMERS} competing translation consumers`);

  } catch (error) {
    console.error('Error in startTranslateCompetingConsumers:', error);
  }
}

async function handleErrorQueue(connection) {
  const channel = await connection.createChannel();
  await channel.assertQueue('error_queue', { durable: true });

  channel.consume('error_queue', async (msg) => {
    if (msg !== null) {
      const content = JSON.parse(msg.content.toString());
      const error = msg.properties.headers.error;
      
      console.log(`Processing error queue message:`, {
        content,
        error,
        timestamp: new Date().toISOString()
      });

      channel.ack(msg);
    }
  });
}

async function start() {
  const connection = await amqp.connect('amqp://localhost');
  await startTranslateCompetingConsumers();
  await handleErrorQueue(connection);
}

start().catch(console.error);