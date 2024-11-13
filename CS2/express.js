// express.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const serviceManager = require('./utils/services');
const logger = require('./utils/logger');
const RateLimiter = require('./patterns/rateLimiter');

const { errorHandler } = require('./filters');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Initialize rate limiter with custom options
const rateLimiter = new RateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Bạn đã gửi quá nhiều yêu cầu, vui lòng thử lại sau vài phút.'
});

// Apply rate limiter middleware
app.use(rateLimiter.getInstance());

// Ensure output directory exists
if (!fs.existsSync('./output')) {
    fs.mkdirSync('./output');
}

// Static file middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static('uploads'));

app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    logger.info(`Server running on http://localhost:${PORT}`);
});

// Home route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Upload route with enhanced error handling
app.post('/upload', upload.array('images', 10), async (req, res) => {
    try {
        if (!req.files?.length) {
            logger.error('No files uploaded.');
            return res.status(400).send('No files uploaded.');
        }

        const imagePaths = req.files.map(file => file.path);
        const pdfPaths = await serviceManager.processImages(imagePaths);

        res.json({
            success: true,
            pdfPaths,
        });
    } catch (error) {
        logger.error('Upload processing error:', error.message);
        res.status(500).send('An unexpected error occurred while processing the upload.');
    }
});

// Download route
app.get('/download/:pdfName', (req, res) => {
    const pdfPath = path.join(__dirname, 'output', req.params.pdfName);
    res.download(pdfPath, (error) => {
        if (error) {
            logger.error(`Download error for file ${req.params.pdfName}:`, error);
            if (!res.headersSent) {
                res.status(404).send('File not found');
            }
        }
    });
});
