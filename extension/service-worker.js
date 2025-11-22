import {
  getModelId,
  getThinkingConfig,
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
  } else if (actionType === "noTextCustom2") {
    systemPrompt = (await chrome.storage.local.get({ noTextCustomPrompt2: "" })).noTextCustomPrompt2;
  } else if (actionType === "noTextCustom3") {
    systemPrompt = (await chrome.storage.local.get({ noTextCustomPrompt3: "" })).noTextCustomPrompt3;
  } else if (actionType === "textCustom1") {
    systemPrompt = (await chrome.storage.local.get({ textCustomPrompt1: "" })).textCustomPrompt1;
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
  const { characterLimitsCache } = await chrome.storage.session.get({ characterLimitsCache: {} });

  if (characterLimitsCache[modelId] && Date.now() < characterLimitsCache[modelId].expiresAt) {
    return characterLimitsCache[modelId][actionType];
  } else {
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

        // summarize: The number of characters is the same as the maximum number of input tokens in the model,
        //            but is reduced because an Internal Server Error occurs
        // translate: Number of characters equal to the maximum number of output tokens in the model
        // noTextCustom: The same as Summarize
        // textCustom: The same as Summarize
        characterLimitsFromAPI.summarize = json.inputTokenLimit * 3 / 4;
        characterLimitsFromAPI.translate = json.outputTokenLimit;
        characterLimitsFromAPI.noTextCustom = json.inputTokenLimit * 3 / 4;
        characterLimitsFromAPI.textCustom = json.inputTokenLimit * 3 / 4;

        // Update the cache
        characterLimitsCache[modelId] = characterLimitsFromAPI;
        characterLimitsCache[modelId].expiresAt = Date.now() + 24 * 60 * 60 * 1000; // Cache for 24 hours
        await chrome.storage.session.set({ characterLimitsCache: characterLimitsCache });
      } else {
        console.log(await response.text());
      }
    } catch (error) {
      console.error(error);
    }

    return characterLimitsFromAPI[actionType];
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
      const { actionType, mediaType, taskInput, languageModel, languageCode, streamKey } = request;
      const { apiKey, streaming, userModelId } = await chrome.storage.local.get({ apiKey: "", streaming: false, userModelId: "gemini-2.0-flash-001" });
      const modelId = getModelId(languageModel, userModelId);
      const thinkingConfig = getThinkingConfig(languageModel, userModelId);

      const systemPrompt = await getSystemPrompt(
        actionType,
        mediaType,
        languageCode,
        taskInput.length
      );

      let apiContent = {};
      let apiConfig = {};
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

      if (thinkingConfig !== undefined) {
        if (!apiConfig.thinkingConfig) {
          apiConfig.thinkingConfig = {};
        }

        if (thinkingConfig.thinkingLevel) {
          apiConfig.thinkingConfig.thinkingLevel = thinkingConfig.thinkingLevel;
        } else if (thinkingConfig.thinkingBudget) {
          apiConfig.thinkingConfig.thinkingBudget = thinkingConfig.thinkingBudget;
        }
      }

      if (streaming) {
        response = await streamGenerateContent(apiKey, modelId, [apiContent], apiConfig, streamKey);
      } else {
        response = await generateContent(apiKey, modelId, [apiContent], apiConfig);
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

// Firefox for Android does not support chrome.commands, so check for its existence first
if (chrome.commands) {
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
}

// Firefox for Android does not support chrome.contextMenus, so check for its existence first
if (chrome.contextMenus) {
  chrome.contextMenus.onClicked.addListener((info) => {
    (async () => {
      try {
        await chrome.storage.session.set({ triggerAction: info.menuItemId });
        await chrome.action.openPopup();
      } catch (error) {
        await chrome.storage.session.remove("triggerAction");
        console.log(error);
        console.log("If you're using Firefox, open \"about:config\" and set \"extensions.openPopupWithoutUserGesture.enabled\" to true.");
      }
    })();
  });
}

const initContextMenus = async () => {
  const options = await chrome.storage.local.get({
    contextMenus: true,
    contextMenuLabel1: "",
    contextMenuLabel2: "",
    contextMenuLabel3: "",
    contextMenuLabel1Text: "",
    contextMenuLabel2Text: "",
    contextMenuLabel3Text: ""
  });

  await createContextMenus(
    options.contextMenus,
    options.contextMenuLabel1,
    options.contextMenuLabel2,
    options.contextMenuLabel3,
    options.contextMenuLabel1Text,
    options.contextMenuLabel2Text,
    options.contextMenuLabel3Text
  );
};

chrome.runtime.onStartup.addListener(initContextMenus);
chrome.runtime.onInstalled.addListener(initContextMenus);
