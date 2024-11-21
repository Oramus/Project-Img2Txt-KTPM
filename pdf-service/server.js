const express = require('express');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer'); // Import puppeteer

const app = express();
app.use(express.json());

const outputDir = './output';
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

app.post('/generate-pdf', async (req, res) => {
  const { text } = req.body;
  const pdfFilename = `output-${Date.now()}.pdf`;
  const pdfPath = path.join(outputDir, pdfFilename);

  try {
    // Mở trình duyệt headless với Puppeteer
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    // Tạo HTML đơn giản từ văn bản
    const content = `
      <html>
        <body>
          <div style="font-family: Arial, sans-serif; font-size: 14px;">
            <p>${text}</p>
          </div>
        </body>
      </html>
    `;
    await page.setContent(content);

    // Tạo PDF từ HTML
    const pdfBuffer = await page.pdf();

    await browser.close();

    // Trả về PDF như là một stream mà không cần ghi vào đĩa
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${pdfFilename}`);
    res.send(pdfBuffer);

    console.log(`PDF created: ${pdfFilename}`);
  } catch (error) {
    console.error('Error creating PDF:', error);
    res.status(500).json({ error: 'PDF generation failed' });
  }
});

app.listen(4002, () => {
  console.log('PDF service running at http://localhost:4002');
});
