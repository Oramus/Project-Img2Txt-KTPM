// pdf-service/server.js
const amqp = require('amqplib');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { connect, sendToQueue } = require('../rabbitmq');

const outputDir = './output';
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

function createPDF(text, pdfFilename) {
  const doc = new PDFDocument();
  const pdfPath = path.join(outputDir, pdfFilename);
  doc.pipe(fs.createWriteStream(pdfPath));
  doc.font('font/Roboto-Regular.ttf').fontSize(14).text(text, 100, 100);
  doc.end();
  return pdfFilename;
}

let channel;

async function consumePDFQueue() {
  try {
    console.log('Starting consumePDFQueue...');
    console.log('Connecting to RabbitMQ...');
    
    // Kết nối đến RabbitMQ
    const connection = await amqp.connect('amqp://localhost');
    console.log('Connected to RabbitMQ successfully.');
    
    // Tạo một kênh mới
    channel = await connection.createChannel();
    console.log('Channel created.');
    
    // Đảm bảo hàng đợi 'pdf_queue' đã được khai báo
    await channel.assertQueue('pdf_queue', { durable: true });
    console.log('Queue "pdf_queue" asserted.');

    // Lắng nghe các tin nhắn từ hàng đợi 'pdf_queue'
    channel.consume('pdf_queue', (msg) => {
      if (msg !== null) {
        const { translatedText, imagePath } = JSON.parse(msg.content.toString());
        console.log(`Creating PDF for: ${translatedText}`);
    
        // Tạo PDF từ văn bản dịch
        const pdfFilename = `output-${Date.now()}.pdf`;
        createPDF(translatedText, pdfFilename);
    
        console.log(`PDF created: ${pdfFilename}`);
    
        // Gửi tên file PDF vào hàng đợi 'pdf-result-queue'
        sendToQueue('pdf-result-queue', JSON.stringify({ pdfFilename, imagePath }));
    
        // Xác nhận tin nhắn đã được xử lý
        channel.ack(msg);
      }
    });
    
  } catch (error) {
    console.error('Error in consumePDFQueue:', error);
  }
}

consumePDFQueue().catch(console.error);
