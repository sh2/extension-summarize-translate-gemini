import {
  getModelConfigs,
  generateContent,
  streamGenerateContent,
  getResponseContent,
  createContextMenus
} from "./utils.js";

// ── Pure utilities (no DOM access, no side effects) ────────────────────────

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
        `in ${languageNames[languageCode]} and reply only with the list.\n\n` +
        "Format:\n1. First point.\n2. Second point.\n3. Third point.\n\n" +
        "Note: If the user asks a follow-up question, disregard the previous " +
        "instruction to reply with a Markdown numbered list. Answer the follow-up " +
        "question naturally, using any format that best fits the answer.";
    } else {
      systemPrompt = `Summarize the entire text as up to ${numItems}-item Markdown numbered list ` +
        `in ${languageNames[languageCode]} and reply only with the list.\n\n` +
        "Format:\n1. First point.\n2. Second point.\n3. Third point.\n\n" +
        "Note: If the user asks a follow-up question, disregard the previous " +
        "instruction to reply with a Markdown numbered list. Answer the follow-up " +
        "question naturally, using any format that best fits the answer.";
    }
  } else if (actionType === "translate") {
    if (mediaType === "image") {
      systemPrompt = `Translate the image into ${languageNames[languageCode]} ` +
        "and reply only with the translated result.\n" +
        "If the user asks a follow-up question, disregard the previous instruction " +
        "to translate and answer the follow-up question naturally.";
    } else {
      systemPrompt = `Translate the entire text into ${languageNames[languageCode]} ` +
        "and reply only with the translated result.\n" +
        "If the user asks a follow-up question, disregard the previous instruction " +
        "to translate and answer the follow-up question naturally.";
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

// ── Core async logic ────────────────────────────────────────────────────────

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

// ── Event listeners ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  (async () => {
    if (request.message === "generate") {
      // Generate content
      const { actionType, mediaType, taskInput, languageModel, languageCode, streamKey, resultIndex, url, title } = request;
      let apiContents;
      let response;
      let responseContent;
      let apiProvider;
      let modelVersion = "";
      const retryStatusKey = `retryStatus_${resultIndex}`;

      try {
        const options = await chrome.storage.local.get({
          apiKey: "",
          apiProvider: "gemini",
          openaiApiKey: "",
          openaiBaseUrl: "",
          openaiModelId: "",
          streaming: false,
          userModelId: "",
          openaiReasoningEffort: "",
          openaiThinkingType: ""
        });

        const {
          apiKey,
          openaiApiKey,
          openaiBaseUrl,
          openaiModelId,
          streaming,
          userModelId,
          openaiReasoningEffort,
          openaiThinkingType
        } = options;

        apiProvider = options.apiProvider;
        const effectiveApiKey = apiProvider === "openai" ? openaiApiKey : apiKey;
        const effectiveModelId = apiProvider === "openai" ? openaiModelId : userModelId;
        const baseUrl = openaiBaseUrl;

        const extraConfig = apiProvider === "openai"
          ? { reasoningEffort: openaiReasoningEffort, thinkingType: openaiThinkingType }
          : {};

        const modelConfigs = getModelConfigs(languageModel, effectiveModelId, apiProvider, extraConfig);

        const systemPrompt = await getSystemPrompt(
          actionType,
          mediaType,
          languageCode,
          taskInput.length
        );

        if (mediaType === "image") {
          const [mediaInfo, mediaData] = taskInput.split(",");
          const mimeType = mediaInfo.split(":")[1].split(";")[0];

          apiContents = [
            { role: "system", parts: [{ text: systemPrompt }] },
            { role: "user", parts: [{ inline_data: { mime_type: mimeType, data: mediaData } }] }
          ];
        } else {
          apiContents = [
            { role: "system", parts: [{ text: systemPrompt }] },
            { role: "user", parts: [{ text: taskInput }] }
          ];
        }

        if (streaming) {
          response = await streamGenerateContent(effectiveApiKey, apiContents, modelConfigs, streamKey, apiProvider, baseUrl, retryStatusKey);
        } else {
          response = await generateContent(effectiveApiKey, apiContents, modelConfigs, apiProvider, baseUrl, retryStatusKey);
        }

        responseContent = getResponseContent(response, Boolean(effectiveApiKey), apiProvider);
        modelVersion = languageModel.includes("/") ? response.body?.modelVersion ?? "" : "";

        await chrome.storage.session.set({
          [`result_${resultIndex}`]: {
            requestApiContent: apiContents,
            responseContent: responseContent,
            url: url,
            title: title,
            modelVersion: modelVersion
          }
        });
      } catch (error) {
        console.error("Failed to generate content:", error);

        await chrome.storage.session.set({
          [`result_${resultIndex}`]: {
            requestApiContent: apiContents ?? [],
            responseContent: chrome.i18n.getMessage("response_unexpected_response"),
            url: url,
            title: title,
            modelVersion: modelVersion
          }
        });

        try {
          sendResponse({
            ok: false,
            status: 1004,
            body: {
              error: {
                message: chrome.i18n.getMessage("response_unexpected_response")
              }
            }
          });
        } catch (sendError) {
          console.error("Failed to send error response:", sendError);
        }

        return;
      }

      if (response.ok) {
        try {
          const { responseCacheQueue } = await chrome.storage.session.get({ responseCacheQueue: [] });
          const responseCacheKey = JSON.stringify({ actionType, mediaType, taskInput, languageModel, languageCode, apiProvider });

          const updatedQueue = responseCacheQueue
            .filter(item => item.key !== responseCacheKey)
            .concat({
              key: responseCacheKey,
              value: {
                requestApiContent: apiContents,
                responseContent: responseContent,
                modelVersion: modelVersion
              }
            })
            .slice(-10);

          await chrome.storage.session.set({ responseCacheQueue: updatedQueue });
        } catch (cacheError) {
          console.error("Failed to update cache:", cacheError);
        }
      }

      try {
        response.modelVersion = modelVersion;
        sendResponse(response);
      } catch (sendError) {
        console.error("Failed to send response:", sendError);
      }
    } else if (request.message === "keepalive") {
      sendResponse({ status: "alive" });
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

chrome.runtime.onStartup.addListener(initContextMenus);
chrome.runtime.onInstalled.addListener(initContextMenus);
