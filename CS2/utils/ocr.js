// utils/ocr.js
const tesseract = require("node-tesseract-ocr");
const logger = require('./logger');

async function image2text(path) {
  try {
    const text = await tesseract.recognize(path, {
      lang: "eng",
    });
    return text;
  } catch (error) {
    logger.error(`OCR error for image ${path}: ${error.message}`);
    throw new Error(`OCR processing failed for image ${path}`);
  }
}

module.exports = {
  image2text,
};
