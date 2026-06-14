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
let resultBaseTitle = chrome.i18n.getMessage("results_title");

// ── Pure utilities (no DOM access, no side effects) ────────────────────────

const validateConversation = (data) => {
  if (!Array.isArray(data)) {
    return false;
  }

  // Ensure we have pairs of user and model entries
  if (data.length % 2 !== 0) {
    return false;
  }

  return data.every((item, index) => {
    if (!item || typeof item !== "object") {
      return false;
    }

    const expectedRole = index % 2 === 0 ? "user" : "model";
    return item.role === expectedRole && Array.isArray(item.parts);
  });
};

const extractTextFromParts = (parts) => {
  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .filter(part => part && typeof part.text === "string")
    .map(part => part.text)
    .join("\n");
};

const isSuccessfulResponse = (response, apiProvider) => {
  if (!response || !response.ok) {
    return false;
  }

  if (apiProvider === "openai") {
    const choice = response.body?.choices?.[0];
    return choice?.finish_reason === "stop" && Boolean(choice?.message?.content);
  } else {
    const candidate = response.body?.candidates?.[0];
    const hasBlock = response.body?.promptFeedback?.blockReason || (candidate?.finishReason && candidate.finishReason !== "STOP");
    const parts = candidate?.content?.parts || [];
    const responsePart = parts[0]?.thought === true ? parts[1] : parts[0];
    return !hasBlock && typeof responsePart?.text === "string" && responsePart.text.length > 0;
  }
};

// ── Tab state & notification ────────────────────────────────────────────────

const isResultTabActive = () => document.visibilityState === "visible" && document.hasFocus();

const updateDocumentTitle = () => {
  if (resultViewStatus === RESULT_VIEW_STATUS.UNREAD) {
    document.title = `● ${resultBaseTitle}`;
  } else if (resultViewStatus === RESULT_VIEW_STATUS.WAITING) {
    document.title = `… ${resultBaseTitle}`;
  } else {
    document.title = resultBaseTitle;
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

// ── UI helpers ──────────────────────────────────────────────────────────────

const appendQuestionToUi = (question) => {
  const formattedQuestionDiv = document.createElement("div");
  formattedQuestionDiv.style.backgroundColor = "var(--nc-bg-3)";
  formattedQuestionDiv.style.borderRadius = "1rem";
  formattedQuestionDiv.style.margin = "1.5rem";
  formattedQuestionDiv.style.padding = "1rem 1rem .1rem";
  formattedQuestionDiv.innerHTML = convertMarkdownToHtml(question, true, false);
  document.getElementById("conversation").appendChild(formattedQuestionDiv);
};

const appendAnswerPlaceholderToUi = () => {
  const formattedAnswerDiv = document.createElement("div");
  document.getElementById("conversation").appendChild(formattedAnswerDiv);
  return formattedAnswerDiv;
};

const setResultControlsEnabled = (enabled) => {
  document.getElementById("clear").disabled = !enabled;
  document.getElementById("copy").disabled = !enabled;
  document.getElementById("save").disabled = !enabled;
  document.getElementById("text").readOnly = !enabled;
  document.getElementById("languageModel").disabled = !enabled;
  document.getElementById("send").disabled = !enabled;
};

const updatePageSource = () => {
  const pageSourceElement = document.getElementById("page-source");
  const pageSourceTitleElement = document.getElementById("page-source-title");

  if (result.title) {
    pageSourceTitleElement.textContent = result.title;
    pageSourceElement.style.display = "block";
  } else {
    pageSourceTitleElement.textContent = "";
    pageSourceElement.style.display = "none";
  }
};

// ── Button action handlers ──────────────────────────────────────────────────

const clearConversation = async () => {
  // Clear the conversation
  document.getElementById("conversation").replaceChildren();
  conversation.length = 0;

  try {
    await chrome.storage.session.remove(`conversation_${resultIndex}`);
  } catch (error) {
    console.error("Failed to remove conversation from session storage:", error);
  }
};

const copyContent = async () => {
  try {
    const operationStatus = document.getElementById("operation-status");
    let clipboardContent = `${result.responseContent.replace(/\n+$/, "")}\n\n`;

    for (const item of conversation) {
      const text = extractTextFromParts(item?.parts);

      if (text) {
        clipboardContent += `${text.replace(/\n+$/, "")}\n\n`;
      }
    }

    // Copy the content to the clipboard
    await navigator.clipboard.writeText(clipboardContent);

    // Display a message indicating that the content was copied
    operationStatus.textContent = chrome.i18n.getMessage("results_copied");
    setTimeout(() => operationStatus.textContent = "", 1000);
  } catch (error) {
    console.error("Failed to copy content:", error);
  }
};

const saveContent = () => {
  const operationStatus = document.getElementById("operation-status");
  const headerLines = [];
  let fileContent = "";

  if (result.title) {
    headerLines.push(result.title);
  }

  if (result.url) {
    headerLines.push(result.url);
  }

  if (headerLines.length > 0) {
    fileContent += `${headerLines.join("\n")}\n\n`;
  }

  fileContent += `${result.responseContent.replace(/\n+$/, "")}\n\n`;

  for (const item of conversation) {
    const text = extractTextFromParts(item?.parts);

    if (text) {
      fileContent += `${text.replace(/\n+$/, "")}\n\n`;
    }
  }

  // Save the content to a text file
  exportTextToFile(fileContent);

  // Display a message indicating that the content was saved
  operationStatus.textContent = chrome.i18n.getMessage("results_saved");
  setTimeout(() => operationStatus.textContent = "", 1000);
};

// ── Core async logic ────────────────────────────────────────────────────────

const askQuestion = async () => {
  const question = document.getElementById("text").value.trim();

  if (!question) {
    return;
  }

  // Disable the buttons and input fields
  setResultControlsEnabled(false);

  // Display a loading message
  let displayIntervalId = setInterval(displayLoadingMessage, 500, "send-status", chrome.i18n.getMessage("results_waiting_response"));

  // Render user's question immediately
  appendQuestionToUi(question);
  document.getElementById("text").value = "";

  // Append the formatted answer placeholder to the conversation
  const formattedAnswerDiv = appendAnswerPlaceholderToUi();

  // Scroll to the bottom of the page
  window.scrollTo(0, document.body.scrollHeight);

  let answer;
  let streamIntervalId = null;

  try {
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

    // Prepare the first question and answer
    const apiContents = [...result.requestApiContent];
    apiContents.push({ role: "model", parts: [{ text: result.responseContent }] });

    // Add the previous questions and answers (already in Gemini style) to the conversation
    apiContents.push(...conversation);

    // Add the new question to the conversation
    apiContents.push({ role: "user", parts: [{ text: question }] });

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
      streamIntervalId = setInterval(async () => {
        const streamContent = (await chrome.storage.session.get({ [streamKey]: "" }))[streamKey];

        if (streamContent) {
          formattedAnswerDiv.innerHTML = convertMarkdownToHtml(streamContent, false, renderLinks);
        }
      }, 1000);

      // Wait for responsePromise
      response = await responsePromise;

      // Stop streaming
      clearInterval(streamIntervalId);
      streamIntervalId = null;
    } else {
      response = await generateContent(effectiveApiKey, apiContents, modelConfigs, apiProvider, baseUrl);
    }

    console.log("Response:", response);
    answer = getResponseContent(response, Boolean(effectiveApiKey), apiProvider);

    // Update the formatted answer in the conversation
    formattedAnswerDiv.innerHTML = convertMarkdownToHtml(answer, false, renderLinks);

    // Display the model version for user-specified models
    if (languageModel.includes("/")) {
      document.getElementById("send-status").textContent = response.body?.modelVersion ?? "";
    } else {
      document.getElementById("send-status").textContent = "";
    }

    // If the response is successful, update the conversation list and storage
    if (isSuccessfulResponse(response, apiProvider)) {
      conversation.push({ role: "user", parts: [{ text: question }] });
      conversation.push({ role: "model", parts: [{ text: answer }] });

      try {
        await chrome.storage.session.set({ [`conversation_${resultIndex}`]: conversation });
      } catch (storageError) {
        console.error("Failed to save conversation to session storage:", storageError);
      }

      // If auto-save is enabled, save the content (safely isolated)
      if (autoSave) {
        try {
          saveContent();
        } catch (saveError) {
          console.error("Auto-save failed:", saveError);
        }
      }
    } else {
      console.warn("API response was not successful or was blocked:", response);
    }

  } catch (error) {
    console.error("Failed to generate content:", error);

    if (streamIntervalId) {
      clearInterval(streamIntervalId);
    }

    // Display a friendly error message on the answer div
    formattedAnswerDiv.textContent = chrome.i18n.getMessage("response_unexpected_response");
    document.getElementById("send-status").textContent = "";
  } finally {
    // Stop displaying the loading message
    clearInterval(displayIntervalId);
    setResultControlsEnabled(true);

    // Scroll to the bottom of the page
    window.scrollTo(0, document.body.scrollHeight);
  }
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

  const sessionData = await chrome.storage.session.get({
    [`result_${resultIndex}`]: "",
    [`conversation_${resultIndex}`]: []
  });

  result = sessionData[`result_${resultIndex}`];

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

  const baseTitle = chrome.i18n.getMessage("results_title");
  resultBaseTitle = result.title ? `${result.title} - ${baseTitle}` : baseTitle;
  updateDocumentTitle();
  updatePageSource();

  // Convert the content from Markdown to HTML
  const { renderLinks } = await chrome.storage.local.get({ renderLinks: false });
  document.getElementById("content").innerHTML = convertMarkdownToHtml(result.responseContent, false, renderLinks);

  // Restore the conversation from session storage if it exists and is valid
  const savedConversation = sessionData[`conversation_${resultIndex}`];

  if (validateConversation(savedConversation)) {
    conversation.length = 0;
    conversation.push(...savedConversation);

    for (let i = 0; i < savedConversation.length; i += 2) {
      const questionText = extractTextFromParts(savedConversation[i]?.parts);
      const answerText = extractTextFromParts(savedConversation[i + 1]?.parts);

      if (questionText) {
        appendQuestionToUi(questionText);
      }

      if (answerText) {
        const answerPlaceholder = appendAnswerPlaceholderToUi();
        answerPlaceholder.innerHTML = convertMarkdownToHtml(answerText, false, renderLinks);
      }
    }
  }
};

// ── Event listeners ─────────────────────────────────────────────────────────

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
