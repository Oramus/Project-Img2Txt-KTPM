// routes/upload.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const messageQueue = require('../config/rabbitmq');

const storage = multer.diskStorage({
    destination: './uploads/',
    filename: function(req, file, cb) {
        cb(null, uuidv4() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

router.post('/', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const jobId = uuidv4();
        const jobData = {
            id: jobId,
            filePath: req.file.path
        };

        await messageQueue.sendToQueue('image-processing', jobData);
        
        res.json({ 
            message: 'File uploaded successfully',
            jobId: jobId
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/status/:jobId', async (req, res) => {
    // Implementation for checking job status
    res.json({ status: 'pending' });
});

module.exports = router;