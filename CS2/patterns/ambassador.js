// patterns/ambassador.js
class AmbassadorPattern {
    constructor(service) {
        this.service = service;
        this.retryCount = 3;
        this.retryDelay = 1000; // 1 second
    }

    async executeWithRetry(operation, ...args) {
        for (let attempt = 1; attempt <= this.retryCount; attempt++) {
            try {
                return await operation.apply(this.service, args);
            } catch (error) {
                if (attempt === this.retryCount) throw error;
                logger.warn(`Retry attempt ${attempt} for operation failed: ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
            }
        }
    }
}