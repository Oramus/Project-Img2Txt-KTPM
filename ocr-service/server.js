const path = require('path');
const amqp = require('amqplib');
const tesseract = require('node-tesseract-ocr');  
const fs = require('fs');
// Thư mục chứa ảnh (tính từ root)
const dataDir = path.resolve(__dirname, '../data');

// Hàm chuyển ảnh thành văn bản
async function image2text(imagePath) {
  console.log(`Running Tesseract on: ${imagePath}`);
  return await tesseract.recognize(imagePath, { lang: 'eng' });
}

// Hàm kết nối tới RabbitMQ
async function connect() {
  try {
    console.log("Connecting to RabbitMQ...");
    const connection = await amqp.connect('amqp://localhost');
    console.log("Connected to RabbitMQ successfully.");
    return connection;
  } catch (error) {
    console.error('Error connecting to RabbitMQ:', error);
    throw error;
  }
}

// Hàm tiêu thụ hàng đợi OCR
// Hàm tiêu thụ hàng đợi OCR
async function consumeOCRQueue() {
  console.log("Starting consumeOCRQueue...");
  const connection = await connect();
  const channel = await connection.createChannel();
  console.log("Channel created.");

  // Đảm bảo hàng đợi 'ocr_queue' tồn tại
  await channel.assertQueue('ocr_queue', { durable: true });
  console.log("Queue 'ocr_queue' asserted.");

  // Đảm bảo hàng đợi 'translation_queue' tồn tại
  await channel.assertQueue('translation_queue', { durable: true });
  console.log("Queue 'translation_queue' asserted.");

  // Tiêu thụ hàng đợi 'ocr_queue'
  channel.consume('ocr_queue', async (msg) => {
    if (msg !== null) {
      const { imagePath } = JSON.parse(msg.content.toString());
      const absoluteImagePath = path.join(dataDir, path.basename(imagePath)); // Đường dẫn đầy đủ tới file

      console.log(`Processing OCR for: ${absoluteImagePath}`);
      console.log(`File exists: ${fs.existsSync(absoluteImagePath)}`); // Log kiểm tra file có tồn tại hay không

      try {
        const text = await image2text(absoluteImagePath);
        console.log(`OCR result: ${text}`);

        // Gửi kết quả OCR sang translation_queue
        channel.sendToQueue('translation_queue', Buffer.from(JSON.stringify({ text, imagePath })), {
          persistent: true,
        });

        channel.ack(msg);
      } catch (error) {
        console.error(`Error processing ${absoluteImagePath}:`, error);
      }
    }
  });
}


consumeOCRQueue().catch(console.error);
