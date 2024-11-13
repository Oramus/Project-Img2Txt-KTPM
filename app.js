const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const messageQueue = require('./config/rabbitmq');

const app = express();

// Serve static files
app.use(express.static('public'));
app.use('/output', express.static('output'));

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: './uploads/',
    filename: function(req, file, cb) {
        cb(null, uuidv4() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Upload endpoint
app.post('/upload', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Kết nối và tạo queue trước khi sử dụng
        await messageQueue.connect();
        await messageQueue.createQueue('image-processing');

        const jobId = uuidv4();
        const jobData = {
            id: jobId,
            filePath: req.file.path
        };

        await messageQueue.sendToQueue('image-processing', jobData);
        
        // Giả lập xử lý đồng bộ để demo
        // Trong thực tế, bạn sẽ cần implement một hệ thống theo dõi job status
        const pdfPath = `/output/output_${jobId}.pdf`;
        
        res.json({ 
            message: 'Processing completed',
            pdfUrl: pdfPath
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
});