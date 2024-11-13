// workers/imageProcessor.js
const { Pipeline, Filter } = require('../patterns/PipeFilter');
const ocr = require('../utils/ocr');
const { translate } = require('../utils/translate');
const { createPDF } = require('../utils/pdf');
const messageQueue = require('../config/rabbitmq');
const path = require('path');

const pipeline = new Pipeline();

pipeline
    .addFilter(new Filter(async (filePath) => {
        const text = await ocr.image2text(filePath);
        return text;
    }))
    .addFilter(new Filter(async (text) => {
        const translatedText = await translate(text);
        return translatedText;
    }))
    .addFilter(new Filter(async (translatedText) => {
        const pdfPath = createPDF(translatedText);
        return pdfPath;
    }));

async function processImage(jobData) {
    try {
        const result = await pipeline.process(jobData.filePath);
        // Here you could update job status in a database
        return result;
    } catch (error) {
        console.error('Error processing image:', error);
        throw error;
    }
}

// Start worker
async function startWorker() {
    try {
        await messageQueue.connect();
        await messageQueue.createQueue('image-processing');
        
        await messageQueue.consume('image-processing', async (jobData) => {
            try {
                await processImage(jobData);
            } catch (error) {
                console.error('Error processing job:', error);
            }
        });
        
        console.log('Worker started successfully');
    } catch (error) {
        console.error('Error starting worker:', error);
    }
}

startWorker();
