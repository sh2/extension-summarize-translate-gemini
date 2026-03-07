/* globals Readability */

import {
  DEFAULT_LANGUAGE_MODEL,
  applyTheme,
  applyFontSize,
  loadTemplate,
  displayLoadingMessage,
  convertMarkdownToHtml,
  getResponseContent,
  exportTextToFile
} from "./utils.js";

let resultIndex = 0;
let content = "";

const copyContent = async () => {
  const operationStatus = document.getElementById("operation-status");
  let clipboardContent = `${content.replace(/\n+$/, "")}\n\n`;

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
  exportTextToFile(`${tab.url}\n\n${content}`);

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

const getTranscript = async () => {
  const SELECTORS = {
    OPEN_BUTTON: "ytd-video-description-transcript-section-renderer button",
    RENDERER: "ytd-macro-markers-list-renderer",
    SEGMENTS: "transcript-segment-view-model",
    TEXT: ".yt-core-attributed-string"
  };

  // Helper: Wait for the transcript renderer and segments to be fully loaded
  const waitForTranscriptSegments = async () => {
    let lastLength = 0;
    let matchCount = 0;

    for (let i = 0; i < 20; i++) {
      const renderer = document.querySelector(SELECTORS.RENDERER);
      const segments = renderer ? renderer.querySelectorAll(SELECTORS.SEGMENTS) : [];
      const currentLength = segments.length;

      if (currentLength > 0 && currentLength === lastLength) {
        matchCount++;

        if (matchCount >= 2) {
          return segments;
        }
      } else {
        matchCount = 0;
      }

      lastLength = currentLength;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const renderer = document.querySelector(SELECTORS.RENDERER);
    const segments = renderer ? renderer.querySelectorAll(SELECTORS.SEGMENTS) : [];

    if (segments.length > 0) {
      return segments;
    }

    throw new Error("transcript segments not found within 10 seconds.");
  };

  // Main logic to get the transcript text
  const openButton = document.querySelector(SELECTORS.OPEN_BUTTON);

  if (!openButton) {
    return "";
  }

  openButton.click();

  try {
    const transcriptSegments = await waitForTranscriptSegments();

    const transcriptTexts = Array.from(transcriptSegments).map(segment => {
      const textElement = segment.querySelector(SELECTORS.TEXT);
      return textElement ? textElement.textContent.trim() : "";
    });

    return transcriptTexts.join("\n");
  } catch (error) {
    console.log(error);
    return "";
  }
};

const extractTaskInformation = async (triggerAction) => {
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
      case "summarize":
        actionType = "summarize";
        break;
      case "translate":
        actionType = "translate";
        break;
      case "custom-action-1-no-selection":
        actionType = "noTextCustom1";
        break;
      case "custom-action-2-no-selection":
        actionType = "noTextCustom2";
        break;
      case "custom-action-3-no-selection":
        actionType = "noTextCustom3";
        break;
      case "custom-action-1":
      case "custom-action-1-selection":
        actionType = "textCustom1";
        break;
      case "custom-action-2":
      case "custom-action-2-selection":
        actionType = "textCustom2";
        break;
      case "custom-action-3":
      case "custom-action-3-selection":
        actionType = "textCustom3";
        break;
    }

    mediaType = "text";
  } else {
    // If no text is selected, get the whole text of the page
    actionType = (await chrome.storage.local.get({ noTextAction: "summarize" })).noTextAction;

    switch (triggerAction) {
      case "summarize":
        actionType = "summarize";
        break;
      case "translate":
        actionType = "translate";
        break;
      case "custom-action-1":
      case "custom-action-1-no-selection":
        actionType = "noTextCustom1";
        break;
      case "custom-action-2":
      case "custom-action-2-no-selection":
        actionType = "noTextCustom2";
        break;
      case "custom-action-3":
      case "custom-action-3-no-selection":
        actionType = "noTextCustom3";
        break;
      case "custom-action-1-selection":
        actionType = "textCustom1";
        break;
      case "custom-action-2-selection":
        actionType = "textCustom2";
        break;
      case "custom-action-3-selection":
        actionType = "textCustom3";
        break;
    }

    if (tab.url.startsWith("https://www.youtube.com/watch?")) {
      // If the page is a YouTube video, get the captions instead of the whole text
      mediaType = "captions";

      const displayIntervalId = setInterval(displayLoadingMessage, 500, "status", chrome.i18n.getMessage("popup_retrieving_captions"));

      try {
        taskInput = (await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: getTranscript
        }))[0].result;
      } catch (error) {
        console.log(error);
      } finally {
        if (displayIntervalId) {
          // Stop displaying the loading message
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
  const { renderLinks } = await chrome.storage.local.get({ renderLinks: false });
  let displayIntervalId = 0;
  let responseContent = "";
  let modelVersion = "";
  let didGenerate = false;

  // Clear the content
  content = "";

  // Increment the result index
  resultIndex = (await chrome.storage.session.get({ resultIndex: -1 })).resultIndex;
  resultIndex = (resultIndex + 1) % 10;
  await chrome.storage.session.set({ resultIndex: resultIndex });

  // Clear stale result to prevent results.html from picking up old data
  await chrome.storage.session.remove(`result_${resultIndex}`);

  try {
    const { apiKey, streaming } = await chrome.storage.local.get({ apiKey: "", streaming: false });
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const languageModel = document.getElementById("languageModel").value;
    const languageCode = document.getElementById("languageCode").value;
    const triggerAction = document.getElementById("triggerAction").value;

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
    const { actionType, mediaType, taskInput } = await extractTaskInformation(triggerAction);

    // Display a loading message
    displayIntervalId = setInterval(displayLoadingMessage, 500, "status", getLoadingMessage(actionType, mediaType));

    // Check the cache
    const { responseCacheQueue } = await chrome.storage.session.get({ responseCacheQueue: [] });
    const cacheIdentifier = JSON.stringify({ actionType, mediaType, taskInput, languageModel, languageCode });
    const responseCache = responseCacheQueue.find(item => item.key === cacheIdentifier);

    if (useCache && responseCache) {
      // Use the cached response
      const { requestApiContent, responseContent: cachedResponseContent } = responseCache.value;
      responseContent = cachedResponseContent;

      await chrome.storage.session.set({
        [`result_${resultIndex}`]: {
          requestApiContent,
          responseContent: cachedResponseContent,
          url: tab.url
        }
      });
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
        taskInput: taskInput,
        languageModel: languageModel,
        languageCode: languageCode,
        streamKey: streamKey,
        resultIndex: resultIndex,
        url: tab.url
      });

      console.log("Request:", {
        actionType: actionType,
        mediaType: mediaType,
        taskInput: taskInput,
        languageModel: languageModel,
        languageCode: languageCode,
        streamKey: streamKey,
        resultIndex: resultIndex,
        url: tab.url
      });

      if (streaming) {
        // Stream the content
        streamIntervalId = setInterval(async () => {
          const streamContent = (await chrome.storage.session.get({ [streamKey]: "" }))[streamKey];

          if (streamContent) {
            document.getElementById("content").innerHTML = convertMarkdownToHtml(streamContent, false, renderLinks);
          }
        }, 1000);
      }

      // Display the "View Results" link if the response is not received within 5 seconds
      const timeoutId = setTimeout(() => { document.getElementById("results-link").style.display = "block"; }, 5000);

      // Wait for responsePromise
      const response = await responsePromise;
      console.log("Response:", response);
      responseContent = getResponseContent(response, Boolean(apiKey));
      modelVersion = languageModel.includes("/") ? response.body?.modelVersion ?? "" : "";

      // Clear the timeout for displaying the "View Results" link
      clearTimeout(timeoutId);
      document.getElementById("results-link").style.display = "none";

      // Stop streaming
      clearInterval(streamIntervalId);
    }

    content = responseContent;
  } catch (error) {
    content = chrome.i18n.getMessage("popup_miscellaneous_error");
    console.error(error);
  } finally {
    // Stop displaying the loading message
    clearInterval(displayIntervalId);

    // Convert the content from Markdown to HTML
    document.getElementById("content").innerHTML = convertMarkdownToHtml(content, false, renderLinks);

    // If auto-save is enabled and content was generated, save the content
    const { autoSave } = await chrome.storage.local.get({ autoSave: false });

    if (autoSave && didGenerate) {
      await saveContent();
    }

    // Enable the buttons and input fields
    document.getElementById("status").textContent = modelVersion;
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
    await chrome.storage.local.get({ languageModel: DEFAULT_LANGUAGE_MODEL, languageCode: "en" });

  document.getElementById("languageModel").value = languageModel;
  document.getElementById("languageCode").value = languageCode;

  // Set the default language model if the language model is not set
  if (!document.getElementById("languageModel").value) {
    document.getElementById("languageModel").value = DEFAULT_LANGUAGE_MODEL;
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

document.getElementById("results-link").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL(`results.html?i=${resultIndex}`) }, () => {
    window.close();
  });
});

document.getElementById("options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage(() => {
    window.close();
  });
});
