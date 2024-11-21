const express = require('express');
const multer = require('multer');
const path = require('path');
const tesseract = require('node-tesseract-ocr');
const fs = require('fs');

const app = express();
const upload = multer({ dest: 'uploads/' }); // Thư mục tạm lưu ảnh

app.post('/ocr', upload.single('image'), async (req, res) => {
  const imagePath = req.file?.path; // Đảm bảo `req.file` không phải là undefined

  if (!imagePath) {
    return res.status(400).json({ error: 'No image file uploaded' });
  }

  try {
    console.log(`Running Tesseract on: ${imagePath}`);
    const text = await tesseract.recognize(imagePath, { lang: 'eng' });
    console.log(`OCR result: ${text}`);
    res.json({ text });
  } catch (error) {
    console.error('Error during OCR processing:', error);
    res.status(500).json({ error: 'OCR processing failed' });
  } finally {
    // Xóa file sau khi xử lý xong
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
  }
});

app.listen(4000, () => {
  console.log('OCR service running at http://localhost:4000');
});
