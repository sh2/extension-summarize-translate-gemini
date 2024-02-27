const modelId = "gemini-1.0-pro";

const getSystemPrompt = (task, languageCode) => {
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

  if (task === "summarize") {
    return "Summarize the entire text as Markdown numbered lists. " +
      "Do not add headings to the summary. " +
      "Do not use nested lists. " +
      `Your response must be in ${languageName[languageCode]}.\n` +
      "Format:\n1. First point\n2. Second point\n3. Third point";
  } else if (task === "translate") {
    return `Translate the entire text into ${languageName[languageCode]} ` +
      "and reply only with the translated result.";
  } else {
    return "";
  }
};

const getCharacterLimit = (modelId, task) => {
  // Limit on the number of characters handled at one time
  // so as not to exceed the maximum number of tokens sent and received by the API.
  // In Gemini, the calculation is performed in the following way
  // Summarize: Four times the number of characters of the maximum number of output tokens in the model
  // Translate: Number of characters equal to the maximum number of output tokens in the model
  const characterLimits = {
    "gemini-1.0-pro": {
      summarize: 8192,
      translate: 2048
    }
  };

  return characterLimits[modelId][task];
};

const chunkText = (text, chunkSize) => {
  const chunks = [];
  const sentenceBreaks = ["\n\n", "。", "．", ".", "\n", " "];
  let remainingText = text.replace(/\r\n?/g, "\n");

  while (remainingText.length > chunkSize) {
    const currentChunk = remainingText.substring(0, chunkSize);
    let index = -1;

    // Look for sentence breaks at 80% of the chunk size or later
    for (const sentenceBreak of sentenceBreaks) {
      index = currentChunk.indexOf(sentenceBreak, Math.floor(chunkSize * 0.8));

      if (index !== -1) {
        index += sentenceBreak.length;
        break;
      }
    }

    if (index === -1) {
      index = chunkSize;
    }

    chunks.push(remainingText.substring(0, index));
    remainingText = remainingText.substring(index);
  }

  chunks.push(remainingText);
  return chunks;
};

const tryJsonParse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text } };
  }
};

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  (async () => {
    if (request.message === "chunk") {
      // Split the user prompt
      const userPromptChunks = chunkText(request.userPrompt, getCharacterLimit(modelId, request.task));
      sendResponse(userPromptChunks);
    } else if (request.message === "generate") {
      // Generate content
      const { apiKey, languageCode } = await chrome.storage.local.get({ apiKey: "", languageCode: "en" });
      const systemPrompt = getSystemPrompt(request.task, languageCode);
      const userPrompt = request.userPrompt;

      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${modelId}:generateContent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [{
              role: "user",
              parts: [{ text: systemPrompt + "\nText:\n" + userPrompt }]
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
