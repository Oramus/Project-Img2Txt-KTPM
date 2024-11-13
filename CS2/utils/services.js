// utils/services.js
const ImageProcessingService = require('../services/ImageProcessingService');
const AmbassadorPattern = require('../patterns/ambassador');

class ServiceManager {
    constructor() {
        this.imageService = new ImageProcessingService();
        this.ambassador = new AmbassadorPattern(this.imageService);
    }

    async processImage(imagePath) {
        return this.ambassador.executeWithRetry(
            this.imageService.processImage,
            imagePath
        );
    }

    async processImages(imagePaths) {
        return this.ambassador.executeWithRetry(
            this.imageService.processImages,
            imagePaths
        );
    }
}

module.exports = new ServiceManager();