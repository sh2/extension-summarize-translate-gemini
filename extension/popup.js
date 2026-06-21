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
let pageUrl = "";
let pageTitle = "";

// ── Pure utilities (no DOM access, no side effects) ────────────────────────

const getLoadingMessage = (actionType, mediaType) => {
  let loadingMessage;

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

const getResultsPageUrl = (index) => {
  return chrome.runtime.getURL(`results.html?i=${index}`);
};

// ── Content script injection utilities ──────────────────────────────────────

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
  const TRANSCRIPT_VARIANTS = [
    {
      RENDERER: "yt-section-list-renderer",
      SEGMENTS: "transcript-segment-view-model",
      TEXT: ".ytAttributedStringHost"
    },
    {
      RENDERER: "ytd-transcript-renderer",
      SEGMENTS: "ytd-transcript-segment-renderer",
      TEXT: "yt-formatted-string"
    }
  ];

  const getTranscriptElements = () => {
    for (const variant of TRANSCRIPT_VARIANTS) {
      const renderer = document.querySelector(variant.RENDERER);
      const segments = renderer ? renderer.querySelectorAll(variant.SEGMENTS) : [];

      if (segments.length > 0) {
        return { variant, segments };
      }
    }

    return null;
  };

  // Helper: Wait for the transcript renderer and segments to be fully loaded
  const waitForTranscriptSegments = async () => {
    let lastLength = 0;
    let matchCount = 0;

    for (let i = 0; i < 20; i++) {
      const transcriptElements = getTranscriptElements();
      const currentLength = transcriptElements ? transcriptElements.segments.length : 0;

      if (currentLength > 0 && currentLength === lastLength) {
        matchCount++;

        if (matchCount >= 2) {
          return transcriptElements;
        }
      } else {
        matchCount = 0;
      }

      lastLength = currentLength;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error("transcript segments not found within 10 seconds.");
  };

  // Main logic to get the transcript text
  const openButton = document.querySelector("ytd-video-description-transcript-section-renderer button");

  if (!openButton) {
    return "";
  }

  openButton.click();

  try {
    const { variant, segments } = await waitForTranscriptSegments();

    const transcriptTexts = Array.from(segments).map(segment => {
      const textElement = segment.querySelector(variant.TEXT);
      return textElement ? textElement.textContent.trim() : "";
    });

    return transcriptTexts.join("\n");
  } catch (error) {
    console.log(error);
    return "";
  }
};

// ── UI helpers ──────────────────────────────────────────────────────────────

const setPopupControlsEnabled = (enabled) => {
  document.getElementById("run").disabled = !enabled;
  document.getElementById("languageModel").disabled = !enabled;
  document.getElementById("languageCode").disabled = !enabled;
  document.getElementById("copy").disabled = !enabled;
  document.getElementById("save").disabled = !enabled;
  document.getElementById("results").disabled = !enabled;
};

const closeStaleResultTab = async (index) => {
  const { resultTabIds = {} } = await chrome.storage.session.get({ resultTabIds: {} });
  const staleTabId = resultTabIds[index];

  if (staleTabId === undefined) {
    return;
  }

  try {
    await chrome.tabs.remove(staleTabId);
  } catch (error) {
    console.debug("Stale results tab was already closed:", error);
  }

  delete resultTabIds[index];
  await chrome.storage.session.set({ resultTabIds });
};

const rememberResultTab = async (index, tabId) => {
  const { resultTabIds = {} } = await chrome.storage.session.get({ resultTabIds: {} });
  resultTabIds[index] = tabId;
  await chrome.storage.session.set({ resultTabIds });
};

const closePopupWithNotice = () => {
  document.getElementById("status").textContent = chrome.i18n.getMessage("popup_opening_in_tab");

  setTimeout(() => {
    window.close();
  }, 1000);
};

// ── Button action handlers ──────────────────────────────────────────────────

const copyContent = async () => {
  try {
    const operationStatus = document.getElementById("operation-status");
    let clipboardContent = `${content.replace(/\n+$/, "")}\n\n`;

    // Copy the content to the clipboard
    await navigator.clipboard.writeText(clipboardContent);

    // Display a message indicating that the content was copied
    operationStatus.textContent = chrome.i18n.getMessage("popup_copied");
    setTimeout(() => operationStatus.textContent = "", 1000);
  } catch (error) {
    console.error("Failed to copy content:", error);
  }
};

const saveContent = () => {
  const operationStatus = document.getElementById("operation-status");
  const headerLines = [];
  let fileContent = "";

  if (pageTitle) {
    headerLines.push(pageTitle);
  }

  if (pageUrl) {
    headerLines.push(pageUrl);
  }

  if (headerLines.length > 0) {
    fileContent += `${headerLines.join("\n")}\n\n`;
  }

  fileContent += `${content.replace(/\n+$/, "")}\n\n`;

  // Save the content to a text file
  exportTextToFile(fileContent);

  // Display a message indicating that the content was saved
  operationStatus.textContent = chrome.i18n.getMessage("popup_saved");
  setTimeout(() => operationStatus.textContent = "", 1000);
};

// ── Core async logic ────────────────────────────────────────────────────────

const extractTaskInformation = async (triggerAction) => {
  let actionType;
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

  return { actionType, mediaType, taskInput, url: tab.url, title: tab.title };
};

const main = async (useCache) => {
  const { renderLinks, openResultsInTab, autoSave } = await chrome.storage.local.get({
    renderLinks: false,
    openResultsInTab: false,
    autoSave: false
  });

  let displayIntervalId = 0;
  let responseContent;
  let modelVersion = "";
  let didGenerate = false;
  let openedInTab = false;

  // Clear the content and source metadata
  content = "";
  pageUrl = "";
  pageTitle = "";

  // Increment the result index
  resultIndex = (await chrome.storage.session.get({ resultIndex: -1 })).resultIndex;
  resultIndex = (resultIndex + 1) % 20;
  await chrome.storage.session.set({ resultIndex: resultIndex });

  // Clear stale result to prevent results.html from picking up old data
  await chrome.storage.session.remove(`result_${resultIndex}`);
  await chrome.storage.session.remove(`conversation_${resultIndex}`);
  await chrome.storage.session.remove(`streamContent_${resultIndex}`);
  await chrome.storage.session.remove(`autoSavePending_${resultIndex}`);

  const resultsPageUrl = getResultsPageUrl(resultIndex);

  try {
    const { apiKey, apiProvider, openaiApiKey, streaming } = await chrome.storage.local.get({
      apiKey: "",
      apiProvider: "gemini",
      openaiApiKey: "",
      streaming: false
    });

    const effectiveApiKey = apiProvider === "openai" ? openaiApiKey : apiKey;
    const languageModel = document.getElementById("languageModel").value;
    const languageCode = document.getElementById("languageCode").value;
    const triggerAction = document.getElementById("triggerAction").value;

    // Disable the buttons and input fields
    document.getElementById("content").textContent = "";
    document.getElementById("status").textContent = "";
    setPopupControlsEnabled(false);

    // Extract the task information
    const { actionType, mediaType, taskInput, url, title } = await extractTaskInformation(triggerAction);
    pageUrl = url;
    pageTitle = title;

    // Display a loading message
    displayIntervalId = setInterval(displayLoadingMessage, 500, "status", getLoadingMessage(actionType, mediaType));

    // Check the cache
    const { responseCacheQueue } = await chrome.storage.session.get({ responseCacheQueue: [] });
    const cacheIdentifier = JSON.stringify({ actionType, mediaType, taskInput, languageModel, languageCode, apiProvider });
    const responseCache = responseCacheQueue.find(item => item.key === cacheIdentifier);

    if (useCache && responseCache) {
      // Use the cached response
      const { requestApiContent, responseContent: cachedResponseContent } = responseCache.value;
      responseContent = cachedResponseContent;

      await chrome.storage.session.set({
        [`result_${resultIndex}`]: {
          requestApiContent,
          responseContent: cachedResponseContent,
          url: url,
          title: title
        }
      });

      if (openResultsInTab) {
        try {
          await closeStaleResultTab(resultIndex);
          const tab = await chrome.tabs.create({ url: resultsPageUrl, active: false });

          if (tab.id !== undefined) {
            await rememberResultTab(resultIndex, tab.id);
          }

          openedInTab = true;
          closePopupWithNotice();
          return;
        } catch (error) {
          console.error("Failed to open results tab:", error);
        }
      }
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
        url: url,
        title: title
      });

      console.log("Request:", {
        actionType: actionType,
        mediaType: mediaType,
        taskInput: taskInput,
        languageModel: languageModel,
        languageCode: languageCode,
        streamKey: streamKey,
        resultIndex: resultIndex,
        url: url,
        title: title
      });

      if (openResultsInTab) {
        if (autoSave) {
          await chrome.storage.session.set({ [`autoSavePending_${resultIndex}`]: true });
        }

        responsePromise.catch(async (error) => {
          console.error("sendMessage rejected:", error);

          try {
            await chrome.storage.session.remove(`autoSavePending_${resultIndex}`);

            await chrome.storage.session.set({
              [`result_${resultIndex}`]: {
                requestApiContent: [],
                responseContent: chrome.i18n.getMessage("response_unexpected_response"),
                url: url,
                title: title
              }
            });
          } catch (storageError) {
            console.error("Failed to persist sendMessage rejection result:", storageError);
          }
        });

        try {
          await closeStaleResultTab(resultIndex);
          const tab = await chrome.tabs.create({ url: resultsPageUrl, active: false });

          if (tab.id !== undefined) {
            await rememberResultTab(resultIndex, tab.id);
          }

          openedInTab = true;
          closePopupWithNotice();
          return;
        } catch (error) {
          console.error("Failed to open results tab:", error);
          await chrome.storage.session.remove(`autoSavePending_${resultIndex}`);
        }
      }

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
      responseContent = getResponseContent(response, Boolean(effectiveApiKey), apiProvider);
      modelVersion = languageModel.includes("/") ? response.body?.modelVersion ?? "" : "";

      // Clear the timeout for displaying the "View Results" link
      clearTimeout(timeoutId);
      document.getElementById("results-link").style.display = "none";

      // Stop streaming
      clearInterval(streamIntervalId);

      if (streaming) {
        await chrome.storage.session.remove(streamKey);
      }
    }

    content = responseContent;
  } catch (error) {
    content = chrome.i18n.getMessage("popup_miscellaneous_error");
    console.error(error);
  } finally {
    // Stop displaying the loading message
    clearInterval(displayIntervalId);

    if (!openedInTab) {
      // Convert the content from Markdown to HTML
      document.getElementById("content").innerHTML = convertMarkdownToHtml(content, false, renderLinks);

      // If auto-save is enabled and content was generated, save the content
      if (autoSave && didGenerate) {
        try {
          saveContent();
        } catch (saveError) {
          console.error("Auto-save failed:", saveError);
        }
      }

      // Enable the buttons and input fields
      document.getElementById("status").textContent = modelVersion;
      setPopupControlsEnabled(true);
    }
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

  // Restore the language model, api provider and language code from the local storage
  const { languageModel, languageCode, apiProvider } =
    await chrome.storage.local.get({ languageModel: DEFAULT_LANGUAGE_MODEL, languageCode: "en", apiProvider: "gemini" });

  const languageModelSelect = document.getElementById("languageModel");

  if (apiProvider === "openai") {
    languageModelSelect.querySelectorAll("option:not([value=zz])").forEach(option => {
      option.setAttribute("hidden", "");
    });

    const zzOption = languageModelSelect.querySelector("option[value=zz]");
    const userSpecifiedGroup = zzOption ? zzOption.closest("optgroup") : null;

    languageModelSelect.querySelectorAll("optgroup").forEach(optgroup => {
      if (optgroup !== userSpecifiedGroup) {
        optgroup.setAttribute("hidden", "");
      }
    });

    languageModelSelect.value = "zz";
  } else {
    languageModelSelect.value = languageModel;

    // Set the default language model if the language model is not set
    if (!languageModelSelect.value) {
      languageModelSelect.value = DEFAULT_LANGUAGE_MODEL;
    }
  }

  document.getElementById("languageCode").value = languageCode;

  // Restore the trigger action from the session storage
  const { triggerAction } = await chrome.storage.session.get({ triggerAction: "" });
  document.getElementById("triggerAction").value = triggerAction;
  await chrome.storage.session.remove("triggerAction");

  main(true);
};

// ── Event listeners ─────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", initialize);

document.getElementById("run").addEventListener("click", () => {
  main(false);
});

document.getElementById("copy").addEventListener("click", copyContent);
document.getElementById("save").addEventListener("click", saveContent);

document.getElementById("results").addEventListener("click", async () => {
  await closeStaleResultTab(resultIndex);
  const tab = await chrome.tabs.create({ url: getResultsPageUrl(resultIndex) });

  if (tab.id !== undefined) {
    await rememberResultTab(resultIndex, tab.id);
  }

  window.close();
});

document.getElementById("results-link").addEventListener("click", async () => {
  await closeStaleResultTab(resultIndex);
  const tab = await chrome.tabs.create({ url: getResultsPageUrl(resultIndex) });

  if (tab.id !== undefined) {
    await rememberResultTab(resultIndex, tab.id);
  }

  window.close();
});

document.getElementById("options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage(() => {
    window.close();
  });
});
