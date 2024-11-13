// filters/PDFFilter.js
const { createPDF } = require('../utils/pdf');
const logger = require('../utils/logger');

class PDFFilter extends BaseFilter {
    async process(text) {
        try {
            const fileName = `output_${Date.now()}.pdf`;
            await createPDF(text, fileName);
            logger.info(`PDF created successfully: ${fileName}`);
            return fileName;
        } catch (error) {
            logger.error(`PDF creation failed: ${error.message}`);
            throw error;
        }
    }
}