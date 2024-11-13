// filters/ImagePreprocessFilter.js
const sharp = require('sharp');
const logger = require('../utils/logger');

class ImagePreprocessFilter extends BaseFilter {
    async process(imagePath) {
        try {
            const processedImagePath = `${imagePath}_processed.jpg`;
            await sharp(imagePath)
                .resize(800) // Resize to standard width
                .normalize() // Normalize colors
                .sharpen() // Enhance text clarity
                .toFile(processedImagePath);
            
            logger.info(`Image preprocessed successfully: ${imagePath}`);
            return processedImagePath;
        } catch (error) {
            logger.error(`Image preprocessing failed: ${error.message}`);
            throw error;
        }
    }
}