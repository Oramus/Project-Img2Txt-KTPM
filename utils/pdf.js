const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Đảm bảo thư mục output tồn tại
const outputDir = './output';
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

function createPDF(text, pdfFilename) {
  const doc = new PDFDocument();
  const pdfPath = path.join(outputDir, pdfFilename); // Lưu vào thư mục output
  doc.pipe(fs.createWriteStream(pdfPath));
  doc.font('font/Roboto-Regular.ttf')
    .fontSize(14)
    .text(text, 100, 100);
  doc.end();
  return pdfFilename;
}

module.exports = {
  createPDF
};
