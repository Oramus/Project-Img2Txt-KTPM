// services/ImageProcessingService.js
const Pipeline = require('../pipeline/Pipeline');
const QueueService = require('../queue/QueueService');
const { ImagePreprocessFilter, OCRFilter, TranslationFilter, PDFFilter } = require('../filters');

class ImageProcessingService {
    constructor() {
        this.pipeline = new Pipeline();
        this.queueService = new QueueService();
        this.configure();
    }

    configure() {
        this.pipeline
            .addFilter(new ImagePreprocessFilter())
            .addFilter(new OCRFilter())
            .addFilter(new TranslationFilter())
            .addFilter(new PDFFilter());
    }

    async processImage(imagePath) {
        try {
            const pdfFileName = await this.pipeline.process(imagePath);
            logger.info(`Successfully processed image: ${imagePath}`);
            return pdfFileName;
        } catch (error) {
            logger.error(`Failed to process image: ${imagePath}`, error);
            throw error;
        }
    }

    async processImages(imagePaths) {
        const pdfPaths = [];
        for (const imagePath of imagePaths) {
            try {
                const pdfFileName = await this.processImage(imagePath);
                pdfPaths.push(`/download/${pdfFileName}`);
            } catch (error) {
                logger.error(`Failed to process image ${imagePath}: ${error.message}`);
            }
        }
        return pdfPaths;
    }
}