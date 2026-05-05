import {
  DEFAULT_LANGUAGE_MODEL,
  applyTheme,
  applyFontSize,
  loadTemplate,
  displayLoadingMessage,
  convertMarkdownToHtml,
  getModelConfigs,
  generateContent,
  streamGenerateContent,
  getResponseContent,
  exportTextToFile
} from "./utils.js";

const RESULT_VIEW_STATUS = Object.freeze({
  IDLE: "idle",
  WAITING: "waiting",
  UNREAD: "unread"
});

const conversation = [];
let resultIndex = 0;
let result = {};
let resultViewStatus = RESULT_VIEW_STATUS.IDLE;

const setResultControlsEnabled = (enabled) => {
  document.getElementById("clear").disabled = !enabled;
  document.getElementById("copy").disabled = !enabled;
  document.getElementById("save").disabled = !enabled;
  document.getElementById("text").readOnly = !enabled;
  document.getElementById("languageModel").disabled = !enabled;
  document.getElementById("send").disabled = !enabled;
};

const isResultTabActive = () => document.visibilityState === "visible" && document.hasFocus();

const updateDocumentTitle = () => {
  const baseTitle = chrome.i18n.getMessage("results_title");

  if (resultViewStatus === RESULT_VIEW_STATUS.UNREAD) {
    document.title = `● ${baseTitle}`;
  } else if (resultViewStatus === RESULT_VIEW_STATUS.WAITING) {
    document.title = `… ${baseTitle}`;
  } else {
    document.title = baseTitle;
  }
};

const syncAttentionCue = () => {
  if (resultViewStatus === RESULT_VIEW_STATUS.UNREAD && isResultTabActive()) {
    resultViewStatus = RESULT_VIEW_STATUS.IDLE;
  }

  updateDocumentTitle();
};

const beginWaitingForResult = () => {
  resultViewStatus = RESULT_VIEW_STATUS.WAITING;
  updateDocumentTitle();
};

const completeWaitingForResult = () => {
  resultViewStatus = isResultTabActive() ? RESULT_VIEW_STATUS.IDLE : RESULT_VIEW_STATUS.UNREAD;
  updateDocumentTitle();
};

const clearConversation = () => {
  // Clear the conversation
  document.getElementById("conversation").replaceChildren();
  conversation.length = 0;
};

const copyContent = async () => {
  const operationStatus = document.getElementById("operation-status");
  let clipboardContent = `${result.responseContent.replace(/\n+$/, "")}\n\n`;

  conversation.forEach((item) => {
    clipboardContent += `${item.question.replace(/\n+$/, "")}\n\n`;
    clipboardContent += `${item.answer.replace(/\n+$/, "")}\n\n`;
  });

  // Copy the content to the clipboard
  await navigator.clipboard.writeText(clipboardContent);

  // Display a message indicating that the content was copied
  operationStatus.textContent = chrome.i18n.getMessage("results_copied");
  setTimeout(() => operationStatus.textContent = "", 1000);
};

const saveContent = () => {
  const operationStatus = document.getElementById("operation-status");
  let content = `${result.responseContent.replace(/\n+$/, "")}\n\n`;

  conversation.forEach((item) => {
    content += `${item.question.replace(/\n+$/, "")}\n\n`;
    content += `${item.answer.replace(/\n+$/, "")}\n\n`;
  });

  // Save the content to a text file
  exportTextToFile(`${result.url}\n\n${content}`);

  // Display a message indicating that the content was saved
  operationStatus.textContent = chrome.i18n.getMessage("results_saved");
  setTimeout(() => operationStatus.textContent = "", 1000);
};

const askQuestion = async () => {
  const question = document.getElementById("text").value.trim();
  let answer;

  if (!question) {
    return;
  }

  // Disable the buttons and input fields
  setResultControlsEnabled(false);

  // Display a loading message
  let displayIntervalId = setInterval(displayLoadingMessage, 500, "send-status", chrome.i18n.getMessage("results_waiting_response"));

  // Prepare the first question and answer
  const apiContents = [...result.requestApiContent];
  apiContents.push({ role: "model", parts: [{ text: result.responseContent }] });

  // Add the previous questions and answers to the conversation
  conversation.forEach((message) => {
    apiContents.push({ role: "user", parts: [{ text: message.question }] });
    apiContents.push({ role: "model", parts: [{ text: message.answer }] });
  });

  // Add the new question to the conversation
  apiContents.push({ role: "user", parts: [{ text: question }] });

  // Create a new div element with the formatted question
  const formattedQuestionDiv = document.createElement("div");
  formattedQuestionDiv.style.backgroundColor = "var(--nc-bg-3)";
  formattedQuestionDiv.style.borderRadius = "1rem";
  formattedQuestionDiv.style.margin = "1.5rem";
  formattedQuestionDiv.style.padding = "1rem 1rem .1rem";
  formattedQuestionDiv.innerHTML = convertMarkdownToHtml(question, true, false);

  // Append the formatted question to the conversation
  document.getElementById("conversation").appendChild(formattedQuestionDiv);
  document.getElementById("text").value = "";

  // Append the formatted answer to the conversation
  const formattedAnswerDiv = document.createElement("div");
  document.getElementById("conversation").appendChild(formattedAnswerDiv);

  // Scroll to the bottom of the page
  window.scrollTo(0, document.body.scrollHeight);

  // Generate the response
  const {
    apiKey,
    apiProvider,
    openaiApiKey,
    openaiBaseUrl,
    openaiModelId,
    streaming,
    userModelId,
    renderLinks,
    autoSave,
    openaiReasoningEffort,
    openaiThinkingType
  } = await chrome.storage.local.get({
    apiKey: "",
    apiProvider: "gemini",
    openaiApiKey: "",
    openaiBaseUrl: "",
    openaiModelId: "",
    streaming: false,
    userModelId: "",
    renderLinks: false,
    autoSave: false,
    openaiReasoningEffort: "",
    openaiThinkingType: ""
  });

  const languageModel = document.getElementById("languageModel").value;
  const effectiveApiKey = apiProvider === "openai" ? openaiApiKey : apiKey;
  const effectiveModelId = apiProvider === "openai" ? openaiModelId : userModelId;
  const baseUrl = openaiBaseUrl;

  const extraConfig = apiProvider === "openai"
    ? { reasoningEffort: openaiReasoningEffort, thinkingType: openaiThinkingType }
    : {};

  const modelConfigs = getModelConfigs(languageModel, effectiveModelId, apiProvider, extraConfig);
  let response;

  if (streaming) {
    const streamKey = `streamContent_${resultIndex}`;
    const responsePromise = streamGenerateContent(effectiveApiKey, apiContents, modelConfigs, streamKey, apiProvider, baseUrl);

    console.log("Request:", {
      apiContents,
      modelConfigs,
      streamKey
    });

    // Stream the content
    const streamIntervalId = setInterval(async () => {
      const streamContent = (await chrome.storage.session.get({ [streamKey]: "" }))[streamKey];

      if (streamContent) {
        formattedAnswerDiv.innerHTML = convertMarkdownToHtml(streamContent, false, renderLinks);
      }
    }, 1000);

    // Wait for responsePromise
    response = await responsePromise;

    // Stop streaming
    clearInterval(streamIntervalId);
  } else {
    response = await generateContent(effectiveApiKey, apiContents, modelConfigs, apiProvider, baseUrl);
  }

  console.log("Response:", response);
  answer = getResponseContent(response, Boolean(effectiveApiKey), apiProvider);

  // Stop displaying the loading message
  clearInterval(displayIntervalId);

  // Update the formatted answer in the conversation
  formattedAnswerDiv.innerHTML = convertMarkdownToHtml(answer, false, renderLinks);

  // Add the question and answer to the conversation
  conversation.push({ question: question, answer: answer });

  // If auto-save is enabled, save the content
  if (autoSave) {
    saveContent();
  }

  // Enable the buttons and input fields
  if (document.getElementById("languageModel").value.includes("/")) {
    document.getElementById("send-status").textContent = response.body?.modelVersion ?? "";
  } else {
    document.getElementById("send-status").textContent = "";
  }

  setResultControlsEnabled(true);
};

const waitForResult = async (resultIndex) => {
  const { streaming, renderLinks } = await chrome.storage.local.get({ streaming: false, renderLinks: false });
  const streamKey = `streamContent_${resultIndex}`;
  const resultKey = `result_${resultIndex}`;
  const contentElement = document.getElementById("content");

  // Keepalive: periodically ping the service worker to prevent termination
  const keepaliveIntervalId = setInterval(async () => {
    try {
      await chrome.runtime.sendMessage({ message: "keepalive" });
    } catch {
      // Ignore errors during keepalive ping
    }
  }, 20000);

  // Streaming poll: show intermediate content while waiting
  let streamIntervalId = null;

  if (streaming) {
    streamIntervalId = setInterval(async () => {
      const streamContent = (await chrome.storage.session.get({ [streamKey]: "" }))[streamKey];

      if (streamContent && contentElement) {
        contentElement.innerHTML = convertMarkdownToHtml(streamContent, false, renderLinks);
      }
    }, 1000);
  }

  // Result poll: wait for the final result
  const result = await new Promise((resolve) => {
    const check = async () => {
      const storedResult = (await chrome.storage.session.get({ [resultKey]: "" }))[resultKey];

      if (storedResult) {
        resolve(storedResult);
      } else {
        setTimeout(check, 500);
      }
    };

    check();
  });

  // Stop the keepalive and streaming intervals
  clearInterval(keepaliveIntervalId);
  clearInterval(streamIntervalId);

  return result;
};

const initialize = async () => {
  // Apply the theme
  applyTheme((await chrome.storage.local.get({ theme: "system" })).theme);

  // Apply font size
  applyFontSize((await chrome.storage.local.get({ fontSize: "medium" })).fontSize);

  // Load the language model template
  const languageModelTemplate = await loadTemplate("languageModelTemplate");
  document.getElementById("languageModelContainer").appendChild(languageModelTemplate);

  // Set the text direction of the body
  document.body.setAttribute("dir", chrome.i18n.getMessage("@@bidi_dir"));

  // Set the text of elements with the data-i18n attribute
  document.querySelectorAll("[data-i18n]").forEach(element => {
    element.textContent = chrome.i18n.getMessage(element.getAttribute("data-i18n"));
  });

  // Restore the language model and api provider from storage
  const { languageModel, apiProvider } = await chrome.storage.local.get({ languageModel: DEFAULT_LANGUAGE_MODEL, apiProvider: "gemini" });
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

  // Restore the content from the session storage
  const urlParams = new URLSearchParams(window.location.search);
  resultIndex = urlParams.get("i");
  result = (await chrome.storage.session.get({ [`result_${resultIndex}`]: "" }))[`result_${resultIndex}`];

  if (!result) {
    // Disable the buttons and input fields while waiting
    setResultControlsEnabled(false);
    beginWaitingForResult();

    // Display a loading message while waiting for the result
    const displayIntervalId = setInterval(displayLoadingMessage, 500, "send-status", chrome.i18n.getMessage("results_waiting_for_result"));

    // Wait for the result to be available in the session storage
    result = await waitForResult(resultIndex);
    completeWaitingForResult();

    // Stop displaying the loading message
    clearInterval(displayIntervalId);
    document.getElementById("send-status").textContent = "";

    // Re-enable the buttons and input fields
    setResultControlsEnabled(true);
  }

  // Convert the content from Markdown to HTML
  const { renderLinks } = await chrome.storage.local.get({ renderLinks: false });
  document.getElementById("content").innerHTML = convertMarkdownToHtml(result.responseContent, false, renderLinks);
};

window.addEventListener("focus", syncAttentionCue);
document.addEventListener("visibilitychange", syncAttentionCue);
document.addEventListener("DOMContentLoaded", initialize);
document.getElementById("clear").addEventListener("click", clearConversation);
document.getElementById("copy").addEventListener("click", copyContent);
document.getElementById("save").addEventListener("click", saveContent);
document.getElementById("send").addEventListener("click", askQuestion);

document.getElementById("text").addEventListener("keydown", (e) => {
  if (e.isComposing || e.key === "Process") {
    return;
  }

  // Check if Ctrl (or Cmd) + Enter is pressed
  if ((e.ctrlKey || e.metaKey) && (e.key === "Enter" || e.key === "NumpadEnter")) {
    e.preventDefault();

    if (!document.getElementById("send").disabled) {
      askQuestion();
    }
  }
});
