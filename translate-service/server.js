const amqp = require('amqplib');
const { connect, sendToQueue } = require('../rabbitmq');
const translator = require("open-google-translator");

let channel;

async function translate(text) {
  return new Promise((resolve, reject) => {
    translator
      .TranslateLanguageData({
        listOfWordsToTranslate: [text],
        fromLanguage: "en",
        toLanguage: "vi",
      })
      .then((data) => {
        resolve(data[0].translation);
      }).catch((err) => {
        reject(err);
      });
  });
}

async function consumeTranslateQueue() {
  try {
    console.log('Starting consumeTranslateQueue...');
    console.log('Connecting to RabbitMQ...');
    
    // Kết nối với RabbitMQ
    const connection = await amqp.connect('amqp://localhost');
    console.log('Connected to RabbitMQ successfully.');
    
    // Tạo một kênh để giao tiếp với RabbitMQ
    channel = await connection.createChannel();
    console.log('Channel created.');
    
    // Đảm bảo rằng hàng đợi 'translation_queue' đã được khai báo
    await channel.assertQueue('translation_queue', { durable: true });
    console.log('Queue "translation_queue" asserted.');
    
    // Lắng nghe các tin nhắn từ 'translation_queue'
    channel.consume('translation_queue', async (msg) => {
      if (msg !== null) {
        const { text, imagePath } = JSON.parse(msg.content.toString());
        console.log(`Received text to translate: ${text}`);
        
        try {
          // Dịch văn bản
          const translatedText = await translate(text);
          console.log(`Translated text: ${translatedText}`);
          
          // Gửi kết quả dịch vào hàng đợi PDF
          sendToQueue('pdf_queue', JSON.stringify({ translatedText, imagePath }));
          
          // Xác nhận tin nhắn đã được xử lý
          channel.ack(msg);
        } catch (error) {
          console.error(`Error translating text: ${error}`);
        }
      }
    });
  } catch (error) {
    console.error('Error in consumeTranslateQueue:', error);
  }
}

consumeTranslateQueue();
