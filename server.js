const express = require('express');
const multer = require('multer');
const { image2text } = require("./utils/ocr");
const { createPDF } = require("./utils/pdf");
const { translate } = require("./utils/translate");
const { connect, sendToQueue, consumeQueue } = require('./rabbitmq');

const app = express();
const port = 3000;

// Thiết lập lưu trữ tạm thời cho Multer (hỗ trợ nhiều file)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, './data/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

// Lưu tên các file PDF tạo ra
let pdfFiles = [];

app.post('/upload', upload.array('images'), async (req, res) => {
  try {
    const imagePaths = req.files.map(file => file.path);
    console.log(`Images uploaded: ${imagePaths}`);

    // Lấy thông tin tên ảnh từ request
    let filenames = req.files.map(file => file.originalname);

    // Kết nối đến RabbitMQ
    await connect();

    // Mảng các promise cho tất cả các file
    let promises = [];

    // Bước 1: OCR - Chuyển ảnh thành văn bản và đưa vào Queue
    for (const imagePath of imagePaths) {
      const text = await image2text(imagePath);
      console.log(`OCR text: ${text}`);

      // Gửi tin nhắn vào RabbitMQ và trả về promise
      const promise = new Promise((resolve) => {
        sendToQueue('ocr_queue', JSON.stringify({ text, imagePath }));
        resolve(); // Đảm bảo gửi xong message
      });
      promises.push(promise);
    }

    // Bước 2: Đợi tất cả các tin nhắn từ Queue (dịch và tạo PDF)
    await Promise.all(promises); // Chờ đến khi tất cả tin nhắn được gửi đi

    // Bước 3: Đảm bảo đã xử lý và tạo tất cả các file PDF
    await new Promise((resolve) => {
      consumeQueue('ocr_queue', async (message) => {
        const { text, imagePath } = JSON.parse(message);
        console.log(`Processing message: ${text}`);

        // Bước 3: Dịch văn bản
        const translatedText = await translate(text);
        console.log(`Translated text: ${translatedText}`);

        // Bước 4: Tạo file PDF
        const pdfFilename = `output-${Date.now()}.pdf`;
        createPDF(translatedText, pdfFilename);

        // Lưu tên file PDF đã tạo
        pdfFiles.push(pdfFilename);

        // Nếu tất cả tin nhắn đã được xử lý, gọi resolve
        if (pdfFiles.length === imagePaths.length) {
          resolve();
        }
      });
    });

    // Trả về giao diện để người dùng tải PDF (hiển thị tên ảnh và nút download)
    res.send(`
      <h1>File(s) processed successfully!</h1>
      ${filenames.map((filename, index) => `
        <p>
          ${filename} - 
          <a href="/output/${pdfFiles[index]}" download>Download PDF</a>
        </p>
      `).join('')}
    `);
  } catch (error) {
    console.error(error);
    res.status(500).send('Server error');
  }
});

// Serve thư mục output để người dùng có thể tải file PDF
app.use('/output', express.static('output'));

// Serve giao diện web đơn giản
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
    </form>`);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
