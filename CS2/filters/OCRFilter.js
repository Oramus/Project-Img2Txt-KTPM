// filters/OCRFilter.js
const { image2text } = require('../utils/ocr');
const logger = require('../utils/logger');

class OCRFilter extends BaseFilter {
    async process(imagePath) {
        try {
            const text = await image2text(imagePath);
            logger.info(`OCR completed successfully for: ${imagePath}`);
            return text;
        } catch (error) {
            logger.error(`OCR failed: ${error.message}`);
            throw error;
        }
    }
}