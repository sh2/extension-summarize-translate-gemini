const getSystemPrompt = (message, languageCode) => {
  const languageName = {
    en: "English",
    de: "German",
    es: "Spanish",
    fr: "French",
    it: "Italian",
    pt_br: "Brazilian Portuguese",
    ru: "Russian",
    zh_cn: "Simplified Chinese",
    zh_tw: "Traditional Chinese",
    ja: "Japanese",
    ko: "Korean"
  };

  if (message === "summarize") {
    return `Summarize the entire text as bullet points of important information. Your response must be in ${languageName[languageCode]}.`;
  } else if (message === "translate") {
    return `Translate the entire text into ${languageName[languageCode]} and reply only with the translated result.`;
  } else {
    return "";
  }
}

const tryJsonParse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text } };
  }
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  (async () => {
    if (request.message === "summarize" || request.message === "translate") {
      const { apiKey, languageCode } = await chrome.storage.local.get({ apiKey: "", languageCode: "en" })
      const systemPrompt = getSystemPrompt(request.message, languageCode);
      const userPrompt = request.userPrompt;

      try {
        const response = await fetch("https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [{
              role: "user",
              parts: [{ text: systemPrompt + "\nText: " + userPrompt }]
            }],
            safetySettings: [{
              category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
              threshold: "BLOCK_NONE"
            },
            {
              category: "HARM_CATEGORY_HATE_SPEECH",
              threshold: "BLOCK_NONE"
            },
            {
              category: "HARM_CATEGORY_HARASSMENT",
              threshold: "BLOCK_NONE"
            },
            {
              category: "HARM_CATEGORY_DANGEROUS_CONTENT",
              threshold: "BLOCK_NONE"
            }]
          })
        });

        sendResponse({
          ok: response.ok,
          status: response.status,
          body: tryJsonParse(await response.text())
        });
      } catch (error) {
        sendResponse({
          ok: false,
          status: 1000,
          body: { error: { message: error.stack } }
        });
      }
    }
  })();

  return true;
});
