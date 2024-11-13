// filters/TranslationFilter.js
const { translate } = require('../utils/translate');
const logger = require('../utils/logger');

class TranslationFilter extends BaseFilter {
    async process(text) {
        try {
            const translatedText = await translate(text);
            logger.info(`Translation completed successfully`);
            return translatedText;
        } catch (error) {
            logger.error(`Translation failed: ${error.message}`);
            throw error;
        }
    }
}