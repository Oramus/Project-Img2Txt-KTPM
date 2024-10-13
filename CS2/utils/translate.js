// utils/translate.js
const translator = require("open-google-translator");
const logger = require('./logger');

translator.supportedLanguages();

function translate(text) {
  return new Promise((resolve, reject) => {
    translator
      .TranslateLanguageData({
        listOfWordsToTranslate: [text],
        fromLanguage: "en",
        toLanguage: "vi",
      })
      .then((data) => {
        resolve(data[0].translation);
      })
      .catch((err) => {
        logger.error(`Translation error for text "${text}": ${err.message}`);
        reject(new Error(`Translation failed for text "${text}"`));
      });
  });
}

module.exports = {
  translate,
};
