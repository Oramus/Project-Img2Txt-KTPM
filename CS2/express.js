// express.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { processImages } = require('./utils/services'); // Import services
const logger = require('./utils/logger');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Tạo thư mục output nếu chưa tồn tại
if (!fs.existsSync('./output')) {
  fs.mkdirSync('./output');
}

// Middleware phục vụ các file tĩnh
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static('uploads'));

// Route trang chủ
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route tải lên tệp và xử lý
app.post('/upload', upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      logger.error('No files uploaded.');
      return res.status(400).send('No files uploaded.');
    }

    const imagePaths = req.files.map(file => file.path);
    const pdfPaths = await processImages(imagePaths); // Gọi đến processImages

    res.json({
      success: true,
      pdfPaths,
    });
  } catch (e) {
    logger.error('Unexpected error:', e.message);
    res.status(500).send('An unexpected error occurred.');
  }
});

// Route tải xuống file PDF sau khi đã xử lý
app.get('/download/:pdfName', (req, res) => {
  const pdfName = req.params.pdfName;
  const pdfPath = path.join(__dirname, 'output', pdfName);
  res.download(pdfPath);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
