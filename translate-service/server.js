// translate-service/server.js
const amqp = require('amqplib');
const translator = require("open-google-translator");
const NUM_CONSUMERS = 3;

async function translate(text) {
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
}

async function createTranslateConsumer(connection) {
  const channel = await connection.createChannel();
  
  await channel.assertQueue('translation_queue', { durable: true });
  await channel.assertQueue('pdf_queue', { durable: true });

  channel.consume('translation_queue', async (msg) => {
    if (msg !== null) {
      try {
        const { text, imagePath } = JSON.parse(msg.content.toString());
        const translatedText = await translate(text);

        channel.sendToQueue('pdf_queue', Buffer.from(JSON.stringify({ 
          translatedText, 
          imagePath 
        })), { persistent: true });

        channel.ack(msg);
      } catch (error) {
        console.error(`Translation error: ${error}`);
        channel.nack(msg, false, false);
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

startTranslateCompetingConsumers().catch(console.error);