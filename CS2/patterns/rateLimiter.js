// patterns/rateLimiter.js
const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

class RateLimiterPattern {
    constructor(options = {}) {
        this.options = {
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100, // limit each IP to 100 requests per windowMs
            message: 'Too many requests, please try again later.',
            ...options
        };
    }

    getInstance() {
        return rateLimit({
            ...this.options,
            handler: (req, res) => {
                logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
                res.status(429).send(this.options.message);
            }
        });
    }
}
