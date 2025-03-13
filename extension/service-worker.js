import {
  getModelId,
  generateContent,
  streamGenerateContent,
  createContextMenus
} from "./utils.js";

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

  // Set the user-specified language
  languageNames["zz"] = (await chrome.storage.local.get({ userLanguage: "Turkish" })).userLanguage;

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
  } else if (actionType === "noTextCustom1") {
    systemPrompt = (await chrome.storage.local.get({ noTextCustomPrompt1: "" })).noTextCustomPrompt1;

    if (!systemPrompt) {
      // Restore the prompt of the previous version
      systemPrompt = (await chrome.storage.local.get({ noTextCustomPrompt: "" })).noTextCustomPrompt;
    }
  } else if (actionType === "noTextCustom2") {
    systemPrompt = (await chrome.storage.local.get({ noTextCustomPrompt2: "" })).noTextCustomPrompt2;
  } else if (actionType === "noTextCustom3") {
    systemPrompt = (await chrome.storage.local.get({ noTextCustomPrompt3: "" })).noTextCustomPrompt3;
  } else if (actionType === "textCustom1") {
    systemPrompt = (await chrome.storage.local.get({ textCustomPrompt1: "" })).textCustomPrompt1;

    if (!systemPrompt) {
      // Restore the prompt of the previous version
      systemPrompt = (await chrome.storage.local.get({ textCustomPrompt: "" })).textCustomPrompt;
    }
  } else if (actionType === "textCustom2") {
    systemPrompt = (await chrome.storage.local.get({ textCustomPrompt2: "" })).textCustomPrompt2;
  } else if (actionType === "textCustom3") {
    systemPrompt = (await chrome.storage.local.get({ textCustomPrompt3: "" })).textCustomPrompt3;
  }

  if (!systemPrompt) {
    systemPrompt = `Respond to the user in ${languageNames[languageCode]} that no custom action is set. ` +
      "Do not process any data after this.";
  }

  return systemPrompt;
};

const getCharacterLimit = async (apiKey, modelId, actionType) => {
  // Limit on the number of characters handled at one time
  // so as not to exceed the maximum number of tokens sent and received by the API.
  // In Gemini, the calculation is performed in the following way
  // Summarize: The number of characters is the same as the maximum number of input tokens in the model,
  //            but is reduced because an Internal Server Error occurs
  // Translate: Number of characters equal to the maximum number of output tokens in the model
  // noTextCustom: The same as Summarize
  // textCustom: The same as Summarize
  const characterLimits = {
    "gemini-2.0-flash": {
      summarize: 786432,
      translate: 8192,
      noTextCustom: 786432,
      textCustom: 786432
    },
    "gemini-2.0-flash-lite": {
      summarize: 786432,
      translate: 8192,
      noTextCustom: 786432,
      textCustom: 786432
    },
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
    "gemini-2.0-pro-exp-02-05": {
      summarize: 1572864,
      translate: 8192,
      noTextCustom: 1572864,
      textCustom: 1572864
    },
    "gemma-3-27b-it": {
      summarize: 98304,
      translate: 8192,
      noTextCustom: 98304,
      textCustom: 98304
    }
  };

  if (!characterLimits[modelId]) {
    // Get the character limits from the API
    const characterLimitsFromAPI = {
      summarize: 8192,
      translate: 8192,
      noTextCustom: 8192,
      textCustom: 8192
    };

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}`, {
        method: "GET",
        headers: {
          "x-goog-api-key": apiKey
        }
      });

      if (response.ok) {
        const json = await response.json();

        characterLimitsFromAPI.summarize = json.inputTokenLimit * 3 / 4;
        characterLimitsFromAPI.translate = json.outputTokenLimit;
        characterLimitsFromAPI.noTextCustom = json.inputTokenLimit * 3 / 4;
        characterLimitsFromAPI.textCustom = json.inputTokenLimit * 3 / 4;
      } else {
        console.log(await response.text());
      }
    } catch (error) {
      console.error(error);
    }

    return characterLimitsFromAPI[actionType];
  } else {
    return characterLimits[modelId][actionType];
  }
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
      const { apiKey, userModelId } = await chrome.storage.local.get({ apiKey: "", userModelId: "gemini-2.0-flash-001" });
      const modelId = getModelId(languageModel, userModelId);
      const chunkSize = await getCharacterLimit(apiKey, modelId, actionType);
      const taskInputChunks = chunkText(taskInput, chunkSize);
      sendResponse(taskInputChunks);
    } else if (request.message === "generate") {
      // Generate content
      const { actionType, mediaType, taskInput, languageModel, languageCode } = request;
      const { apiKey, streaming, userModelId } = await chrome.storage.local.get({ apiKey: "", streaming: false, userModelId: "gemini-2.0-flash-001" });
      const modelId = getModelId(languageModel, userModelId);

      const systemPrompt = await getSystemPrompt(
        actionType,
        mediaType,
        languageCode,
        taskInput.length
      );

      let apiContent = {};
      let response = null;

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

      if (streaming) {
        response = await streamGenerateContent(apiKey, modelId, [apiContent]);
      } else {
        response = await generateContent(apiKey, modelId, [apiContent]);
      }

      // Add the system prompt and the user input to the response
      response.requestApiContent = apiContent;

      if (response.ok) {
        // Update the cache
        const { responseCacheQueue } = await chrome.storage.session.get({ responseCacheQueue: [] });
        const responseCacheKey = JSON.stringify({ actionType, mediaType, taskInput, languageModel, languageCode });

        const updatedQueue = responseCacheQueue
          .filter(item => item.key !== responseCacheKey)
          .concat({ key: responseCacheKey, value: response })
          .slice(-10);

        await chrome.storage.session.set({ responseCacheQueue: updatedQueue });
      }

      sendResponse(response);
    }
  })();

  return true;
});

chrome.commands.onCommand.addListener((command) => {
  (async () => {
    const currentWindow = await chrome.windows.getCurrent({});

    if (currentWindow.focused) {
      try {
        await chrome.storage.session.set({ triggerAction: command });
        await chrome.action.openPopup();
      } catch (error) {
        await chrome.storage.session.remove("triggerAction");
        console.log(error);
        console.log("If you're using Firefox, open \"about:config\" and set \"extensions.openPopupWithoutUserGesture.enabled\" to true.");
      }
    }
  })();
});

chrome.contextMenus.onClicked.addListener((info) => {
  (async () => {
    try {
      await chrome.storage.session.set({ triggerAction: info.menuItemId });
      await chrome.action.openPopup();
    } catch (error) {
      await chrome.storage.session.remove("triggerAction");
      console.log(error);
    }
  })();
});

const initContextMenus = async () => {
  const { contextMenus } = await chrome.storage.local.get({ contextMenus: true });
  await createContextMenus(contextMenus);
};

chrome.runtime.onStartup.addListener(initContextMenus);
chrome.runtime.onInstalled.addListener(initContextMenus);
