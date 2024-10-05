const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ocr = require('./utils/ocr');
const { createPDF } = require('./utils/pdf');
const { translate } = require('./utils/translate');

// Tạo ứng dụng Express
const app = express();

// Thiết lập multer để upload file (multiple files)
const upload = multer({ dest: 'uploads/' });

// Tạo thư mục 'output' nếu chưa có
if (!fs.existsSync('./output')) {
  fs.mkdirSync('./output');
}

// Sử dụng middleware để phục vụ các file tĩnh từ thư mục 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Sử dụng middleware để phục vụ các file ảnh từ thư mục 'uploads'
app.use('/uploads', express.static('uploads'));

// Route cho trang chủ với giao diện tải ảnh và tải PDF
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route để upload file ảnh
app.post('/upload', upload.array('images', 10), async (req, res) => {
  try {
    // Kiểm tra xem file đã được upload chưa
    if (!req.files || req.files.length === 0) {
      return res.status(400).send('No files uploaded.');
    }

    const pdfPaths = [];

    // Xử lý từng file ảnh
    for (let i = 0; i < req.files.length; i++) {
      const imagePath = req.files[i].path;

      // Bước 1: OCR - Chuyển đổi hình ảnh thành văn bản
      const text = await ocr.image2text(imagePath);
      console.log(`Extracted Text from image ${i + 1}:`, text);

      // Bước 2: Dịch văn bản từ tiếng Anh sang tiếng Việt
      const viText = await translate(text);
      console.log(`Translated Text for image ${i + 1}:`, viText);

      // Bước 3: Tạo file PDF từ văn bản đã dịch
      const pdfFileName = `output_${i + 1}.pdf`;
      const pdfFile = createPDF(viText, pdfFileName);

      // Lưu đường dẫn PDF
      pdfPaths.push(`/download/${pdfFileName}`);
    }

    // Trả về đường dẫn các file PDF
    res.json({
      success: true,
      pdfPaths
    });
  } catch (e) {
    console.error('Error:', e);
    res.status(500).send('An error occurred.');
  }
});

// Route để tải file PDF
app.get('/download/:pdfName', (req, res) => {
  const pdfName = req.params.pdfName;
  const pdfPath = path.join(__dirname, 'output', pdfName);
  res.download(pdfPath);
});

// Lắng nghe port 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
