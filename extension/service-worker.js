import { getModelId, generateContent } from "./utils.js";

const getSystemPrompt = async (actionType, mediaType, languageCode, taskInputLength) => {
  const languageNames = {
    en: "English",
    de: "German",
    es: "Spanish",
    fr: "French",
    it: "Italian",
    pt_br: "Brazilian Portuguese",
    vi: "Vietnamese",
    ru: "Russian",
    ar: "Arabic",
    hi: "Hindi",
    bn: "Bengali",
    zh_cn: "Simplified Chinese",
    zh_tw: "Traditional Chinese",
    ja: "Japanese",
    ko: "Korean"
  };

  const numItems = Math.min(10, 3 + Math.floor(taskInputLength / 2000));
  let systemPrompt = "";

  if (actionType === "summarize") {
    if (mediaType === "image") {
      systemPrompt = "Summarize the image as Markdown numbered list " +
        `in ${languageNames[languageCode]} and reply only with the list.\n` +
        "Format:\n1. First point.\n2. Second point.\n3. Third point.";
    } else {
      systemPrompt = `Summarize the entire text as up to ${numItems}-item Markdown numbered list ` +
        `in ${languageNames[languageCode]} and reply only with the list.\n` +
        "Format:\n1. First point.\n2. Second point.\n3. Third point.";
    }
  } else if (actionType === "translate") {
    if (mediaType === "image") {
      systemPrompt = `Translate the image into ${languageNames[languageCode]} ` +
        "and reply only with the translated result.";
    } else {
      systemPrompt = `Translate the entire text into ${languageNames[languageCode]} ` +
        "and reply only with the translated result.";
    }
  } else if (actionType === "noTextCustom") {
    systemPrompt = (await chrome.storage.local.get({ noTextCustomPrompt: "" })).noTextCustomPrompt;
  } else if (actionType === "textCustom") {
    systemPrompt = (await chrome.storage.local.get({ textCustomPrompt: "" })).textCustomPrompt;
  }

  return systemPrompt;
};

const getCharacterLimit = (modelId, actionType) => {
  // Limit on the number of characters handled at one time
  // so as not to exceed the maximum number of tokens sent and received by the API.
  // In Gemini, the calculation is performed in the following way
  // Summarize: The number of characters is the same as the maximum number of input tokens in the model,
  //            but is reduced because an Internal Server Error occurs
  // Translate: Number of characters equal to the maximum number of output tokens in the model
  // noTextCustom: The same as Summarize
  // textCustom: The same as Summarize
  const characterLimits = {
    "gemini-1.5-pro": {
      summarize: 1500000,
      translate: 8192,
      noTextCustom: 1500000,
      textCustom: 1500000
    },
    "gemini-1.5-flash": {
      summarize: 750000,
      translate: 8192,
      noTextCustom: 750000,
      textCustom: 750000
    },
    "gemini-1.5-flash-8b": {
      summarize: 750000,
      translate: 8192,
      noTextCustom: 750000,
      textCustom: 750000
    },
    "gemini-1.5-pro-latest": {
      summarize: 1500000,
      translate: 8192,
      noTextCustom: 1500000,
      textCustom: 1500000
    },
    "gemini-1.5-flash-latest": {
      summarize: 750000,
      translate: 8192,
      noTextCustom: 750000,
      textCustom: 750000
    },
    "gemini-1.5-flash-8b-latest": {
      summarize: 750000,
      translate: 8192,
      noTextCustom: 750000,
      textCustom: 750000
    },
    "gemini-exp-1206": {
      summarize: 1572864,
      translate: 8192,
      noTextCustom: 1572864,
      textCustom: 1572864
    },
    "gemini-2.0-flash-exp": {
      summarize: 786432,
      translate: 8192,
      noTextCustom: 786432,
      textCustom: 786432
    }
  };

  return characterLimits[modelId][actionType];
};

const chunkText = (text, chunkSize) => {
  const chunks = [];
  // ।: U+0964 Devanagari Danda
  const sentenceBreaks = ["\n\n", "।", "。", "．", ".", "\n", " "];
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

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  (async () => {
    if (request.message === "chunk") {
      // Split the task input
      const { actionType, taskInput, languageModel } = request;
      const modelId = getModelId(languageModel);
      const chunkSize = getCharacterLimit(modelId, actionType);
      const taskInputChunks = chunkText(taskInput, chunkSize);
      sendResponse(taskInputChunks);
    } else if (request.message === "generate") {
      // Generate content
      await chrome.storage.session.set({ responseCacheKey: "", responseCache: {} });
      const { actionType, mediaType, taskInput, languageModel, languageCode } = request;
      const { apiKey } = await chrome.storage.local.get({ apiKey: "" });
      const modelId = getModelId(languageModel);

      const systemPrompt = await getSystemPrompt(
        actionType,
        mediaType,
        languageCode,
        taskInput.length
      );

      let apiContent = {};

      if (mediaType === "image") {
        const [mediaInfo, mediaData] = taskInput.split(",");
        const mediaType = mediaInfo.split(":")[1].split(";")[0];

        apiContent = {
          role: "user",
          parts: [
            { text: systemPrompt },
            {
              inline_data: {
                mime_type: mediaType,
                data: mediaData
              }
            }
          ]
        };
      } else {
        apiContent = {
          role: "user",
          parts: [{ text: systemPrompt + "\nText:\n" + taskInput }]
        };
      }

      const response = await generateContent(apiKey, modelId, [apiContent]);

      // Add the system prompt and the user input to the response
      response.requestApiContent = apiContent;

      if (response.ok) {
        const responseCacheKey = JSON.stringify({ actionType, mediaType, taskInput, languageModel, languageCode });
        await chrome.storage.session.set({ responseCacheKey: responseCacheKey, responseCache: response });
      }

      sendResponse(response);
    }
  })();

  return true;
});
