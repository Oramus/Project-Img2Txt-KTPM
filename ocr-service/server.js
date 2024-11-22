// ocr-service/server.js
const path = require('path');
const amqp = require('amqplib');
const tesseract = require('node-tesseract-ocr');  
const fs = require('fs');

const dataDir = path.resolve(__dirname, '../data');
const NUM_CONSUMERS = 3;

async function image2text(imagePath) {
  console.log(`Running Tesseract on: ${imagePath}`);
  return await tesseract.recognize(imagePath, { lang: 'eng' });
}

async function connect() {
  try {
    const connection = await amqp.connect('amqp://localhost');
    return connection;
  } catch (error) {
    console.error('Error connecting to RabbitMQ:', error);
    throw error;
  }
}

async function createConsumer(channel) {
  await channel.assertQueue('ocr_queue', { durable: true });
  await channel.assertQueue('translation_queue', { durable: true });

  channel.consume('ocr_queue', async (msg) => {
    if (msg !== null) {
      const { imagePath } = JSON.parse(msg.content.toString());
      const absoluteImagePath = path.join(dataDir, path.basename(imagePath));

      try {
        const text = await image2text(absoluteImagePath);
        console.log(`OCR result: ${text}`);

        channel.sendToQueue('translation_queue', Buffer.from(JSON.stringify({ text, imagePath })), {
          persistent: true,
        });

        channel.ack(msg);
      } catch (error) {
        console.error(`Error processing ${absoluteImagePath}:`, error);
        channel.nack(msg, false, false); // Không retry, drop message
      }
    }
  }, { 
    consumerTag: `ocr-consumer-${Math.random().toString(36).substr(2, 9)}` 
  });
}

async function startCompetingConsumers() {
  try {
    const connection = await connect();
    console.log("Starting Competing Consumers for OCR Service...");

    // Tạo nhiều consumer
    const consumers = [];
    for (let i = 0; i < NUM_CONSUMERS; i++) {
      const channel = await connection.createChannel();
      consumers.push(createConsumer(channel));
    }

    await Promise.all(consumers);
    console.log(`Started ${NUM_CONSUMERS} competing OCR consumers`);

  } catch (error) {
    console.error('Error in startCompetingConsumers:', error);
  }
}

startCompetingConsumers().catch(console.error);