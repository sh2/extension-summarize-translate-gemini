import {
  applyTheme,
  applyFontSize,
  loadTemplate,
  displayLoadingMessage,
  convertMarkdownToHtml,
  getModelId,
  getThinkingBudget,
  generateContent,
  streamGenerateContent,
  exportTextToFile
} from "./utils.js";

const conversation = [];
let resultIndex = 0;
let result = {};

const clearConversation = () => {
  // Clear the conversation
  document.getElementById("conversation").replaceChildren();
  conversation.length = 0;
};

const copyContent = async () => {
  const operationStatus = document.getElementById("operation-status");
  let clipboardContent = result.responseContent.replace(/\n+$/, "") + "\n\n";

  conversation.forEach((item) => {
    clipboardContent += item.question.replace(/\n+$/, "") + "\n\n";
    clipboardContent += item.answer.replace(/\n+$/, "") + "\n\n";
  });

  // Copy the content to the clipboard
  await navigator.clipboard.writeText(clipboardContent);

  // Display a message indicating that the content was copied
  operationStatus.textContent = chrome.i18n.getMessage("results_copied");
  setTimeout(() => operationStatus.textContent = "", 1000);
};

const saveContent = () => {
  const operationStatus = document.getElementById("operation-status");
  let content = result.responseContent.replace(/\n+$/, "") + "\n\n";

  conversation.forEach((item) => {
    content += item.question.replace(/\n+$/, "") + "\n\n";
    content += item.answer.replace(/\n+$/, "") + "\n\n";
  });

  // Save the content to a text file
  exportTextToFile(result.url + "\n\n" + content);

  // Display a message indicating that the content was saved
  operationStatus.textContent = chrome.i18n.getMessage("popup_saved");
  setTimeout(() => operationStatus.textContent = "", 1000);
};

const askQuestion = async () => {
  const question = document.getElementById("text").value.trim();
  let answer = "";

  if (!question) {
    return;
  }

  // Disable the buttons and input fields
  document.getElementById("clear").disabled = true;
  document.getElementById("copy").disabled = true;
  document.getElementById("save").disabled = true;
  document.getElementById("text").disabled = true;
  document.getElementById("languageModel").disabled = true;
  document.getElementById("send").disabled = true;

  // Display a loading message
  let displayIntervalId = setInterval(displayLoadingMessage, 500, "send-status", chrome.i18n.getMessage("results_waiting_response"));

  // Prepare the first question and answer
  const apiContents = [];
  apiContents.push(result.requestApiContent);
  apiContents.push({ role: "model", parts: [{ text: result.responseContent }] });

  // Add the previous questions and answers to the conversation
  conversation.forEach((message) => {
    apiContents.push({ role: "user", parts: [{ text: message.question }] });
    apiContents.push({ role: "model", parts: [{ text: message.answer }] });
  });

  // Add the new question to the conversation
  apiContents.push({ role: "user", parts: [{ text: question }] });
  console.log(apiContents);

  // Create a new div element with the formatted question
  const formattedQuestionDiv = document.createElement("div");
  formattedQuestionDiv.style.backgroundColor = "var(--nc-bg-3)";
  formattedQuestionDiv.style.borderRadius = "1rem";
  formattedQuestionDiv.style.margin = "1.5rem";
  formattedQuestionDiv.style.padding = "1rem 1rem .1rem";
  formattedQuestionDiv.innerHTML = convertMarkdownToHtml(question, true);

  // Append the formatted question to the conversation
  document.getElementById("conversation").appendChild(formattedQuestionDiv);
  document.getElementById("text").value = "";

  // Append the formatted answer to the conversation
  const formattedAnswerDiv = document.createElement("div");
  document.getElementById("conversation").appendChild(formattedAnswerDiv);

  // Scroll to the bottom of the page
  window.scrollTo(0, document.body.scrollHeight);

  // Generate the response
  const { apiKey, streaming, userModelId } = await chrome.storage.local.get({ apiKey: "", streaming: false, userModelId: "gemini-2.0-flash-001" });
  const languageModel = document.getElementById("languageModel").value;
  const modelId = getModelId(languageModel, userModelId);
  const thinkingBudget = getThinkingBudget(languageModel, userModelId);
  let apiConfig = {};
  let response = null;

  if (thinkingBudget !== undefined) {
    if (!apiConfig.thinkingConfig) {
      apiConfig.thinkingConfig = {};
    }

    apiConfig.thinkingConfig.thinkingBudget = thinkingBudget;
  }

  if (streaming) {
    const streamKey = `streamContent_${resultIndex}`;
    const responsePromise = streamGenerateContent(apiKey, modelId, apiContents, apiConfig, streamKey);

    // Stream the content
    const streamIntervalId = setInterval(async () => {
      const streamContent = (await chrome.storage.session.get({ [streamKey]: "" }))[streamKey];

      if (streamContent) {
        formattedAnswerDiv.innerHTML = convertMarkdownToHtml(`${streamContent}\n\n`, false);
      }
    }, 1000);

    // Wait for responsePromise
    response = await responsePromise;

    if (streamIntervalId) {
      clearInterval(streamIntervalId);
    }
  } else {
    response = await generateContent(apiKey, modelId, apiContents, apiConfig);
  }

  console.log(response);

  if (response.ok) {
    if (response.body.promptFeedback?.blockReason) {
      // The prompt was blocked
      answer = `${chrome.i18n.getMessage("results_prompt_blocked")} ` +
        `Reason: ${response.body.promptFeedback.blockReason}`;
    } else if (response.body.candidates?.[0].finishReason !== "STOP") {
      // The response was blocked
      answer = `${chrome.i18n.getMessage("results_response_blocked")} ` +
        `Reason: ${response.body.candidates[0].finishReason}`;
    } else if (response.body.candidates?.[0].content) {
      // A normal response was returned
      answer = response.body.candidates[0].content.parts[0].text;
    } else {
      // The expected response was not returned
      answer = chrome.i18n.getMessage("results_unexpected_response");
    }
  } else {
    // A response error occurred
    answer = `Error: ${response.status}\n\n${response.body.error.message}`;
  }

  // Clear the loading message
  if (displayIntervalId) {
    clearInterval(displayIntervalId);
  }

  // Enable the buttons and input fields
  document.getElementById("send-status").textContent = "";
  document.getElementById("clear").disabled = false;
  document.getElementById("copy").disabled = false;
  document.getElementById("save").disabled = false;
  document.getElementById("text").disabled = false;
  document.getElementById("languageModel").disabled = false;
  document.getElementById("send").disabled = false;

  // Update the formatted answer in the conversation
  formattedAnswerDiv.innerHTML = convertMarkdownToHtml(answer, false);

  // Add the question and answer to the conversation
  conversation.push({ question: question, answer: answer });
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

  // Restore the language model from the local storage
  const { languageModel } = await chrome.storage.local.get({ languageModel: "2.5-flash:0" });
  document.getElementById("languageModel").value = languageModel;

  // Set the default language model if the language model is not set
  if (!document.getElementById("languageModel").value) {
    document.getElementById("languageModel").value = "2.5-flash:0";
  }

  // Restore the content from the session storage
  const urlParams = new URLSearchParams(window.location.search);
  resultIndex = urlParams.get("i");
  result = (await chrome.storage.session.get({ [`result_${resultIndex}`]: "" }))[`result_${resultIndex}`];

  // Convert the content from Markdown to HTML
  document.getElementById("content").innerHTML = convertMarkdownToHtml(result.responseContent, false);
};

document.addEventListener("DOMContentLoaded", initialize);
document.getElementById("clear").addEventListener("click", clearConversation);
document.getElementById("copy").addEventListener("click", copyContent);
document.getElementById("save").addEventListener("click", saveContent);
document.getElementById("send").addEventListener("click", askQuestion);
