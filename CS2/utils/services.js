// utils/services.js
const ocr = require('./ocr');
const { createPDF } = require('./pdf');
const { translate } = require('./translate');
const logger = require('./logger');

async function processImage(imagePath) {
  try {
    // Bước 1: OCR - Chuyển đổi hình ảnh thành văn bản
    const text = await ocr.image2text(imagePath);
    logger.info(`OCR successful for image: ${imagePath}`);

    // Bước 2: Dịch văn bản từ tiếng Anh sang tiếng Việt
    const viText = await translate(text);
    logger.info(`Translation successful for text from image: "${text}"`);

    // Bước 3: Tạo file PDF từ văn bản đã dịch
    const pdfFileName = `output_${Date.now()}.pdf`;
    createPDF(viText, pdfFileName);
    logger.info(`PDF created: ${pdfFileName}`);
    
    return pdfFileName;
  } catch (error) {
    logger.error(`Error processing image ${imagePath}: ${error.message}`);
    throw new Error(`Processing error for image ${imagePath}`);
  }
}

async function processImages(imagePaths) {
  const pdfPaths = [];
  
  for (const imagePath of imagePaths) {
    try {
      const pdfFileName = await processImage(imagePath);
      pdfPaths.push(`/download/${pdfFileName}`);
    } catch (error) {
      logger.error(`Failed to process image ${imagePath}: ${error.message}`);
    }
  }
  
  return pdfPaths;
}

module.exports = {
  processImages,
};
