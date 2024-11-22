// web-service/server.js
const express = require('express');
const multer = require('multer');
const { sendToQueue, connect } = require('../rabbitmq');
const path = require('path');
const fs = require('fs');
const amqp = require('amqplib');
const app = express();

// Thư mục data và output (tính từ root)
const dataDir = path.resolve(__dirname, '../data');
const outputDir = path.resolve(__dirname, '../output');

// Đảm bảo các thư mục tồn tại
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

const upload = multer({ dest: dataDir }); // Lưu file vào thư mục data

app.get('/', (req, res) => {
  res.send(`
    <h1>Upload Images to Convert to PDF</h1>
    <form ref='uploadForm' 
      id='uploadForm' 
      action='/upload' 
      method='post' 
      encType="multipart/form-data">
        <input type="file" name="images" multiple />
        <input type='submit' value='Upload!' />
    </form>
  `);
});

app.post('/upload', upload.array('images'), async (req, res) => {
  await connect();

  const imagePaths = req.files.map((file) => file.path);

  // Gửi các ảnh vào queue OCR để xử lý
  imagePaths.forEach((imagePath) => {
    sendToQueue('ocr_queue', JSON.stringify({ imagePath }));
  });

  // Lắng nghe kết quả từ 'pdf-result-queue'
  const connection = await amqp.connect('amqp://localhost');
  const channel = await connection.createChannel();
  await channel.assertQueue('pdf-result-queue', { durable: true });

  console.log('Waiting for PDF results...');

  let pdfLinks = [];  // Mảng lưu trữ các liên kết tải về PDF
  let processedCount = 0;  // Đếm số lượng file đã xử lý

  const consumeHandler = (msg) => {
    if (msg !== null) {
      const { pdfFilename, imagePath } = JSON.parse(msg.content.toString());
      const downloadLink = `/output/${pdfFilename}`;

      // Thêm liên kết tải về vào mảng
      pdfLinks.push(`<p><a href="${downloadLink}" target="_blank">${pdfFilename}</a></p>`);

      // Xác nhận tin nhắn đã được xử lý
      channel.ack(msg);

      processedCount++;

      // Nếu đã xử lý xong tất cả các file PDF
      if (processedCount === imagePaths.length) {
        // Hủy bỏ lắng nghe để tránh xử lý các tin nhắn cũ
        channel.cancel(consumeHandler.consumerTag);
        
        res.send(`
          <h2>Processing complete!</h2>
          <p>Your PDFs are ready for download:</p>
          ${pdfLinks.join('')}
        `);
      }
    }
  };

  // Bắt đầu tiêu thụ tin nhắn
  const { consumerTag } = await channel.consume('pdf-result-queue', consumeHandler);
  consumeHandler.consumerTag = consumerTag;
});

// Serve thư mục output để người dùng tải file PDF
app.use('/output', express.static(outputDir));

app.listen(3000, () => {
  console.log('Web service running at http://localhost:3000');
});
