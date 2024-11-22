// pdf-service/server.js
const amqp = require('amqplib');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const outputDir = './output';
const NUM_CONSUMERS = 3;

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

function createPDF(text, pdfFilename) {
  const doc = new PDFDocument();
  const pdfPath = path.join(outputDir, pdfFilename);
  doc.pipe(fs.createWriteStream(pdfPath));
  doc.font('font/Roboto-Regular.ttf').fontSize(14).text(text, 100, 100);
  doc.end();
  return pdfFilename;
}

async function createPDFConsumer(connection) {
  const channel = await connection.createChannel();
  
  await channel.assertQueue('pdf_queue', { durable: true });
  await channel.assertQueue('pdf-result-queue', { durable: true });

  channel.consume('pdf_queue', (msg) => {
    if (msg !== null) {
      try {
        const { translatedText, imagePath } = JSON.parse(msg.content.toString());
        const pdfFilename = `output-${Date.now()}.pdf`;
        
        createPDF(translatedText, pdfFilename);

        channel.sendToQueue('pdf-result-queue', Buffer.from(JSON.stringify({ 
          pdfFilename, 
          imagePath 
        })), { persistent: true });

        channel.ack(msg);
      } catch (error) {
        console.error(`PDF creation error: ${error}`);
        channel.nack(msg, false, false);
      }
    }
  }, { 
    consumerTag: `pdf-consumer-${Math.random().toString(36).substr(2, 9)}` 
  });
}

async function startPDFCompetingConsumers() {
  try {
    const connection = await amqp.connect('amqp://localhost');
    console.log("Starting Competing Consumers for PDF Service...");

    const consumers = [];
    for (let i = 0; i < NUM_CONSUMERS; i++) {
      consumers.push(createPDFConsumer(connection));
    }

    await Promise.all(consumers);
    console.log(`Started ${NUM_CONSUMERS} competing PDF consumers`);

  } catch (error) {
    console.error('Error in startPDFCompetingConsumers:', error);
  }
}

startPDFCompetingConsumers().catch(console.error);