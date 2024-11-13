// index.js
const serviceManager = require('../utils/services');
const logger = require('../utils/logger');

async function main() {
    try {
        const text = await serviceManager.processImage('./data/sample.png');
        logger.info('OCR Text:', text);
        logger.info('PDF File:', pdfFile);
    } catch (error) {
        logger.error('Processing error:', error.message);
    }
}

if (require.main === module) {
    main();
}

// Error handling middleware
const errorHandler = ((error, req, res, next) => {
    logger.error('Unhandled error:', error);
    res.status(500).send('An unexpected error occurred');
});

module.exports = {
    errorHandler
};

