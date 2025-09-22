/* globals protobuf Readability */

import {
  applyTheme,
  applyFontSize,
  loadTemplate,
  displayLoadingMessage,
  convertMarkdownToHtml,
  exportTextToFile
} from "./utils.js";

let resultIndex = 0;
let content = "";

const copyContent = async () => {
  const operationStatus = document.getElementById("operation-status");
  let clipboardContent = content.replace(/\n+$/, "") + "\n\n";

  // Copy the content to the clipboard
  await navigator.clipboard.writeText(clipboardContent);

  // Display a message indicating that the content was copied
  operationStatus.textContent = chrome.i18n.getMessage("popup_copied");
  setTimeout(() => operationStatus.textContent = "", 1000);
};

const saveContent = async () => {
  const operationStatus = document.getElementById("operation-status");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Save the content to a text file
  exportTextToFile(tab.url + "\n\n" + content);

  // Display a message indicating that the content was saved
  operationStatus.textContent = chrome.i18n.getMessage("popup_saved");
  setTimeout(() => operationStatus.textContent = "", 1000);
};

const getSelectedText = () => {
  // Return the selected text
  return window.getSelection().toString();
};

const getWholeText = () => {
  // Return the whole text
  const documentClone = document.cloneNode(true);
  const article = new Readability(documentClone).parse();

  if (article) {
    return article.textContent;
  } else {
    console.log("Failed to parse the article. Using document.body.innerText instead.");
    return document.body.innerText;
  }
};

const getCaptions = async (videoUrl, languageCode) => {
  const encodeToBase64 = (metadataObj) => {
    // Encode the metadata object to a base64 string using protobuf
    const VideoMetadata = protobuf.roots["default"].VideoMetadata;
    const message = VideoMetadata.create(metadataObj);
    const buffer = VideoMetadata.encode(message).finish();
    let binaryString = "";

    for (let i = 0; i < buffer.byteLength; i++) {
      binaryString += String.fromCharCode(buffer[i]);
    }

    return btoa(binaryString);
  };

  const languageCodeForCaptions = {
    en: "en",
    de: "de",
    es: "es",
    fr: "fr",
    it: "it",
    pt_br: "pt-BR",
    vi: "vi",
    ru: "ru",
    ar: "ar",
    hi: "hi",
    bn: "bn",
    zh_cn: "zh-CN",
    zh_tw: "zh-TW",
    ja: "ja",
    ko: "ko",
    zz: "en"
  };

  const preferredLanguages = [languageCodeForCaptions[languageCode], "en"];
  const videoId = new URLSearchParams(new URL(videoUrl).search).get("v");
  const videoResponse = await fetch(videoUrl, { credentials: "omit", });
  const videoBody = await videoResponse.text();
  const captionsConfigJson = videoBody.match(/"captions":(.*?),"videoDetails":/s);
  let captions = "";

  if (captionsConfigJson) {
    const captionsConfig = JSON.parse(captionsConfigJson[1]);

    if (captionsConfig?.playerCaptionsTracklistRenderer?.captionTracks) {
      const captionTracks = captionsConfig.playerCaptionsTracklistRenderer.captionTracks;

      const calculateValue = (a) => {
        let value = preferredLanguages.indexOf(a.languageCode);
        value = value === -1 ? 9999 : value;
        value += a.kind === "asr" ? 0.5 : 0;
        return value;
      };

      // Sort the caption tracks by the preferred languages and the kind
      captionTracks.sort((a, b) => {
        const valueA = calculateValue(a);
        const valueB = calculateValue(b);
        return valueA - valueB;
      });

      const payload = {
        context: {
          client: {
            clientName: "WEB",
            clientVersion: "2.20991231.01.00",
          }
        },
        params: encodeToBase64({
          param1: videoId,
          param2: encodeToBase64({
            param1: captionTracks[0].kind ? captionTracks[0].kind : "",
            param2: captionTracks[0].languageCode
          })
        })
      };

      const captionsResponse = await fetch("https://www.youtube.com/youtubei/v1/get_transcript", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        credentials: "omit"
      });

      const captionsJson = await captionsResponse.json();

      const initialSegments = captionsJson?.actions?.[0]?.
        updateEngagementPanelAction?.content?.transcriptRenderer?.content?.
        transcriptSearchPanelRenderer?.body?.transcriptSegmentListRenderer?.initialSegments;

      let texts = [];

      if (initialSegments) {
        for (const segment of initialSegments) {
          const text = segment?.transcriptSegmentRenderer?.snippet?.runs?.[0]?.text;

          if (text) {
            texts.push(text);
          }
        }

        captions = texts.join(" ");
      }
    } else {
      console.log("No captionTracks found.");
    }
  } else {
    console.log("No captions found.");
  }

  return captions;
};

const extractTaskInformation = async (languageCode, triggerAction) => {
  let actionType = "";
  let mediaType = "";
  let taskInput = "";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Get the selected text
  try {
    taskInput = (await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: getSelectedText
    }))[0].result;
  } catch (error) {
    console.log(error);
  }

  if (taskInput) {
    actionType = (await chrome.storage.local.get({ textAction: "translate" })).textAction;

    switch (triggerAction) {
      case "custom-action-1":
        actionType = "textCustom1";
        break;
      case "custom-action-2":
        actionType = "textCustom2";
        break;
      case "custom-action-3":
        actionType = "textCustom3";
        break;
    }

    mediaType = "text";
  } else {
    // If no text is selected, get the whole text of the page
    actionType = (await chrome.storage.local.get({ noTextAction: "summarize" })).noTextAction;

    switch (triggerAction) {
      case "custom-action-1":
        actionType = "noTextCustom1";
        break;
      case "custom-action-2":
        actionType = "noTextCustom2";
        break;
      case "custom-action-3":
        actionType = "noTextCustom3";
        break;
    }

    if (tab.url.startsWith("https://www.youtube.com/watch?v=") || tab.url.startsWith("https://m.youtube.com/watch?v=")) {
      // If the page is a YouTube video, get the captions instead of the whole text
      mediaType = "captions";

      const displayIntervalId = setInterval(displayLoadingMessage, 500, "status", chrome.i18n.getMessage("popup_retrieving_captions"));

      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["lib/protobuf.min.js"]
        });

        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["lib/video-metadata.js"]
        });

        taskInput = (await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: getCaptions,
          args: [tab.url, languageCode]
        }))[0].result;
      } catch (error) {
        console.log(error);
      } finally {
        if (displayIntervalId) {
          clearInterval(displayIntervalId);
        }
      }
    }

    if (!taskInput) {
      // Get the main text of the page using Readability.js
      mediaType = "text";

      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["lib/Readability.min.js"]
        });

        taskInput = (await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: getWholeText
        }))[0].result;
      } catch (error) {
        console.log(error);
      }
    }

    if (!taskInput) {
      // If the whole text is empty, get the visible tab as an image
      mediaType = "image";
      taskInput = await (chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg" }));
    }
  }

  return { actionType, mediaType, taskInput };
};

const getLoadingMessage = (actionType, mediaType) => {
  let loadingMessage = "";

  if (actionType === "summarize") {
    if (mediaType === "captions") {
      loadingMessage = chrome.i18n.getMessage("popup_summarizing_captions");
    } else if (mediaType === "image") {
      loadingMessage = chrome.i18n.getMessage("popup_summarizing_image");
    } else {
      loadingMessage = chrome.i18n.getMessage("popup_summarizing");
    }
  } else if (actionType === "translate") {
    if (mediaType === "captions") {
      loadingMessage = chrome.i18n.getMessage("popup_translating_captions");
    } else if (mediaType === "image") {
      loadingMessage = chrome.i18n.getMessage("popup_translating_image");
    } else {
      loadingMessage = chrome.i18n.getMessage("popup_translating");
    }
  } else {
    loadingMessage = chrome.i18n.getMessage("popup_processing");
  }

  return loadingMessage;
};

const main = async (useCache) => {
  let displayIntervalId = 0;
  let response = {};
  let didGenerate = false;

  // Clear the content
  content = "";

  // Increment the result index
  resultIndex = (await chrome.storage.session.get({ resultIndex: -1 })).resultIndex;
  resultIndex = (resultIndex + 1) % 10;
  await chrome.storage.session.set({ resultIndex: resultIndex });

  try {
    const { apiKey, streaming } = await chrome.storage.local.get({ apiKey: "", streaming: false });
    const languageModel = document.getElementById("languageModel").value;
    const languageCode = document.getElementById("languageCode").value;
    const triggerAction = document.getElementById("triggerAction").value;
    let taskInputChunks = [];

    // Disable the buttons and input fields
    document.getElementById("content").textContent = "";
    document.getElementById("status").textContent = "";
    document.getElementById("run").disabled = true;
    document.getElementById("languageModel").disabled = true;
    document.getElementById("languageCode").disabled = true;
    document.getElementById("copy").disabled = true;
    document.getElementById("save").disabled = true;
    document.getElementById("results").disabled = true;

    // Extract the task information
    const { actionType, mediaType, taskInput } = await extractTaskInformation(languageCode, triggerAction);

    // Display a loading message
    displayIntervalId = setInterval(displayLoadingMessage, 500, "status", getLoadingMessage(actionType, mediaType));

    // Split the task input
    if (mediaType === "image") {
      // If the task input is an image, do not split it
      taskInputChunks = [taskInput];
    } else {
      taskInputChunks = await chrome.runtime.sendMessage({
        message: "chunk",
        actionType: actionType,
        taskInput: taskInput,
        languageModel: languageModel
      });

      console.log(taskInputChunks);
    }

    for (const taskInputChunk of taskInputChunks) {
      const { responseCacheQueue } = await chrome.storage.session.get({ responseCacheQueue: [] });
      const cacheIdentifier = JSON.stringify({ actionType, mediaType, taskInput: taskInputChunk, languageModel, languageCode });
      const responseCache = responseCacheQueue.find(item => item.key === cacheIdentifier);

      if (useCache && responseCache) {
        // Use the cached response
        response = responseCache.value;
      } else {
        // Indicate that a generation request was made
        didGenerate = true;

        // Generate content
        const streamKey = `streamContent_${resultIndex}`;
        let streamIntervalId = 0;

        const responsePromise = chrome.runtime.sendMessage({
          message: "generate",
          actionType: actionType,
          mediaType: mediaType,
          taskInput: taskInputChunk,
          languageModel: languageModel,
          languageCode: languageCode,
          streamKey: streamKey
        });

        if (streaming) {
          // Stream the content
          streamIntervalId = setInterval(async () => {
            const streamContent = (await chrome.storage.session.get({ [streamKey]: "" }))[streamKey];

            if (streamContent) {
              document.getElementById("content").innerHTML =
                convertMarkdownToHtml(`${content}\n\n${streamContent}\n\n`, false);
            }
          }, 1000);
        }

        // Wait for responsePromise
        response = await responsePromise;

        if (streamIntervalId) {
          clearInterval(streamIntervalId);
        }
      }

      console.log(response);

      if (response.ok) {
        if (response.body.promptFeedback?.blockReason) {
          // The prompt was blocked
          content = `${chrome.i18n.getMessage("popup_prompt_blocked")} ` +
            `Reason: ${response.body.promptFeedback.blockReason}`;
          break;
        } else if (response.body.candidates?.[0].finishReason !== "STOP") {
          // The response was blocked
          content = `${chrome.i18n.getMessage("popup_response_blocked")} ` +
            `Reason: ${response.body.candidates[0].finishReason}`;
          break;
        } else if (response.body.candidates?.[0].content) {
          // A normal response was returned
          content += `${response.body.candidates[0].content.parts[0].text}\n\n`;
          document.getElementById("content").innerHTML = convertMarkdownToHtml(content, false);
        } else {
          // The expected response was not returned
          content = chrome.i18n.getMessage("popup_unexpected_response");
          break;
        }
      } else {
        // A response error occurred
        content = `Error: ${response.status}\n\n${response.body.error.message}`;

        if (!apiKey) {
          // If the API Key is not set, add a message to prompt the user to set it
          content += `\n\n${chrome.i18n.getMessage("popup_no_apikey")}`;
        }

        break;
      }
    }
  } catch (error) {
    content = chrome.i18n.getMessage("popup_miscellaneous_error");
    console.error(error);
  } finally {
    // Clear the loading message
    if (displayIntervalId) {
      clearInterval(displayIntervalId);
    }

    // Convert the content from Markdown to HTML
    document.getElementById("content").innerHTML = convertMarkdownToHtml(content, false);

    // Save the content to the session storage
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    await chrome.storage.session.set({
      [`result_${resultIndex}`]: {
        requestApiContent: response.requestApiContent,
        responseContent: content,
        url: tab.url
      }
    });

    // If auto-save is enabled and content was generated, save the content
    const { autoSave } = await chrome.storage.local.get({ autoSave: false });

    if (autoSave && didGenerate) {
      await saveContent();
    }

    // Enable the buttons and input fields
    document.getElementById("status").textContent = "";
    document.getElementById("run").disabled = false;
    document.getElementById("languageModel").disabled = false;
    document.getElementById("languageCode").disabled = false;
    document.getElementById("copy").disabled = false;
    document.getElementById("save").disabled = false;
    document.getElementById("results").disabled = false;
  }
};

const initialize = async () => {
  // Apply the theme
  applyTheme((await chrome.storage.local.get({ theme: "system" })).theme);

  // Apply font size
  applyFontSize((await chrome.storage.local.get({ fontSize: "medium" })).fontSize);

  // Load the language model template
  const languageModelTemplate = await loadTemplate("languageModelTemplate");
  document.getElementById("languageModelContainer").appendChild(languageModelTemplate);

  // Load the language code template
  const languageCodeTemplate = await loadTemplate("languageCodeTemplate");
  document.getElementById("languageCodeContainer").appendChild(languageCodeTemplate);

  // Set the text direction of the body
  document.body.setAttribute("dir", chrome.i18n.getMessage("@@bidi_dir"));

  // Set the text of elements with the data-i18n attribute
  document.querySelectorAll("[data-i18n]").forEach(element => {
    element.textContent = chrome.i18n.getMessage(element.getAttribute("data-i18n"));
  });

  // Restore the language model and language code from the local storage
  const { languageModel, languageCode } =
    await chrome.storage.local.get({ languageModel: "2.5-flash:0", languageCode: "en" });

  document.getElementById("languageModel").value = languageModel;
  document.getElementById("languageCode").value = languageCode;

  // Set the default language model if the language model is not set
  if (!document.getElementById("languageModel").value) {
    document.getElementById("languageModel").value = "2.5-flash:0";
  }

  // Restore the trigger action from the session storage
  const { triggerAction } = await chrome.storage.session.get({ triggerAction: "" });
  document.getElementById("triggerAction").value = triggerAction;
  await chrome.storage.session.remove("triggerAction");

  main(true);
};

document.addEventListener("DOMContentLoaded", initialize);

document.getElementById("run").addEventListener("click", () => {
  main(false);
});

document.getElementById("copy").addEventListener("click", copyContent);
document.getElementById("save").addEventListener("click", saveContent);

document.getElementById("results").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL(`results.html?i=${resultIndex}`) }, () => {
    window.close();
  });
});

document.getElementById("options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage(() => {
    window.close();
  });
});
