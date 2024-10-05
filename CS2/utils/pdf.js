const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

function createPDF(text, fileName) {
    const OUT_FILE = path.join(__dirname, '../output', fileName);
    const doc = new PDFDocument();
    doc.pipe(fs.createWriteStream(OUT_FILE));
    doc.font('font/Roboto-Regular.ttf')
        .fontSize(14)
        .text(text, 100, 100);
    doc.end();
    return fileName;
}

module.exports = {
    createPDF
}
