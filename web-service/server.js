// web-service/server.js
const express = require('express');
const multer = require('multer');
const { sendToQueue, connect } = require('../rabbitmq');
const path = require('path');
const fs = require('fs');
const amqp = require('amqplib');
const app = express();
const Bottleneck = require('bottleneck');

const dataDir = path.resolve(__dirname, '../data');
const outputDir = path.resolve(__dirname, '../output');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}


if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

const upload = multer({ dest: dataDir });

const limiter = new Bottleneck({
  maxConcurrent: 1,  
  minTime: 250 
});

app.get('/', (req, res) => {
  res.send(`
    <h1>Upload Images to Convert to PDF</h1>
    <form ref='uploadForm' 
      id='uploadForm' 
      action='/upload' 
      method='post' 
      encType="multipart/form-data">
        <input type="file" name="images" multiple />
        <input type='submit' value='Upload!' />
    </form>
  `);
});

app.post('/upload', upload.array('images'), async (req, res) => {
  await connect();

  const imagePaths = req.files.map((file) => file.path);

  imagePaths.forEach((imagePath) => {
    limiter.schedule(() => {
      sendToQueue('ocr_queue', JSON.stringify({ imagePath }));
    });
  });

  const connection = await amqp.connect('amqp://localhost');
  const channel = await connection.createChannel();
  await channel.assertQueue('pdf-result-queue', { durable: true });

  console.log('Waiting for PDF results...');

  let pdfLinks = [];
  let processedCount = 0;

  const consumeHandler = (msg) => {
    if (msg !== null) {
      const { pdfFilename, imagePath } = JSON.parse(msg.content.toString());
      const downloadLink = `/output/${pdfFilename}`;

      pdfLinks.push(`<p><a href="${downloadLink}" target="_blank">${pdfFilename}</a></p>`);

      channel.ack(msg);

      processedCount++;

      if (processedCount === imagePaths.length) {
        channel.cancel(consumeHandler.consumerTag);
        
        res.send(`
          <h2>Processing complete!</h2>
          <p>Your PDFs are ready for download:</p>
          ${pdfLinks.join('')}
        `);
      }
    }
  };

  const { consumerTag } = await channel.consume('pdf-result-queue', consumeHandler);
  consumeHandler.consumerTag = consumerTag;
});

app.use('/output', express.static(outputDir));

app.listen(3000, () => {
  console.log('Web service running at http://localhost:3000');
});
