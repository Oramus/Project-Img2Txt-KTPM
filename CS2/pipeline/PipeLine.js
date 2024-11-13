// pipeline/Pipeline.js
const logger = require('../utils/logger');

class Pipeline {
    constructor() {
        this.filters = [];
    }

    addFilter(filter) {
        this.filters.push(filter);
        return this;
    }

    async process(input) {
        let result = input;
        for (const filter of this.filters) {
            try {
                result = await filter.process(result);
            } catch (error) {
                logger.error(`Pipeline processing failed at filter ${filter.constructor.name}`);
                throw error;
            }
        }
        return result;
    }
}
