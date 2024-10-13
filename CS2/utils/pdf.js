// utils/pdf.js
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

function createPDF(text, fileName) {
  try {
    const OUT_FILE = path.join(__dirname, '../output', fileName);
    const doc = new PDFDocument();
    doc.pipe(fs.createWriteStream(OUT_FILE));
    doc.font('font/Roboto-Regular.ttf')
      .fontSize(14)
      .text(text, 100, 100);
    doc.end();
    return fileName;
  } catch (error) {
    logger.error(`PDF creation error for file ${fileName}: ${error.message}`);
    throw new Error(`PDF creation failed for file ${fileName}`);
  }
}

module.exports = {
  createPDF,
};
