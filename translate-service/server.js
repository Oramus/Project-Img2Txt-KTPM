const express = require('express');
const translator = require('open-google-translator');

const app = express();
app.use(express.json()); // Hỗ trợ body JSON

app.post('/translate', async (req, res) => {
  const { text } = req.body;

  try {
    console.log(`Translating text: ${text}`);
    const translated = await translator.TranslateLanguageData({
      listOfWordsToTranslate: [text],
      fromLanguage: 'en',
      toLanguage: 'vi',
    });
    const translatedText = translated[0].translation;
    console.log(`Translated text: ${translatedText}`);
    res.json({ translatedText });
  } catch (error) {
    console.error('Error during translation:', error);
    res.status(500).json({ error: 'Translation failed' });
  }
});

app.listen(4001, () => {
  console.log('Translation service running at http://localhost:4001');
});
