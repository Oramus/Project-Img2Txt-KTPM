const express = require('express');
const multer = require('multer');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const FormData = require('form-data');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.get('/', (req, res) => {
  res.send(`
    <h1>Upload Images to Convert to PDF</h1>
    <form ref="uploadForm" 
          id="uploadForm" 
          action="/upload" 
          method="post" 
          enctype="multipart/form-data">
      <input type="file" name="images" multiple />
      <input type="submit" value="Upload!" />
    </form>
  `);
});

app.post('/upload', upload.array('images'), async (req, res) => {
  const startTime = Date.now(); // Thời gian bắt đầu xử lý

  try {
    const files = req.files;

    // Xử lý từng file ảnh song song
    const processingTasks = files.map(async (file) => {
      try {
        // Gửi ảnh tới dịch vụ OCR
        const form = new FormData();
        form.append('image', fs.createReadStream(file.path));

        const ocrResponse = await axios.post('http://localhost:4000/ocr', form, {
          headers: { ...form.getHeaders() },
        });
        const text = ocrResponse.data.text;

        // Dịch văn bản
        const translateResponse = await axios.post('http://localhost:4001/translate', { text });
        const translatedText = translateResponse.data.translatedText;

        // Tạo PDF
        const pdfResponse = await axios.post('http://localhost:4002/generate-pdf', { text: translatedText });
        const pdfFilename = pdfResponse.data.pdfFilename;

        // Tạo liên kết tải về
        const downloadLink = `http://localhost:4002/output/${pdfFilename}`;

        // Xóa file ảnh sau khi đã xử lý xong
        fs.unlinkSync(file.path); // Xóa file ảnh tạm đã upload

        return `<p><a href="${downloadLink}" target="_blank">${pdfFilename}</a></p>`;
      } catch (error) {
        console.error(`Error processing file ${file.originalname}:`, error);
        return `<p>Error processing file ${file.originalname}</p>`;
      }
    });

    // Chờ tất cả các task xử lý xong
    const pdfLinks = await Promise.all(processingTasks);

    const endTime = Date.now(); // Thời gian kết thúc xử lý
    const processingTime = ((endTime - startTime) / 1000).toFixed(2); // Tính thời gian xử lý (giây)

    // Trả về HTML với các đường link tải file PDF và thời gian xử lý tổng cộng
    res.send(`
      <h2>Processing complete!</h2>
      <p>Your PDFs are ready for download:</p>
      ${pdfLinks.join('')}
      <p><strong>Total processing time: ${processingTime} seconds</strong></p>
    `);
  } catch (error) {
    console.error('Error during processing:', error);
    res.status(500).json({ error: 'Processing failed' });
  }
});


app.listen(3000, () => {
  console.log('Web service running at http://localhost:3000');
});
