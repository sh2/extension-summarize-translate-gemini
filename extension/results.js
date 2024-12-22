/* global DOMPurify, marked */

import { adjustLayoutForScreenSize, displayLoadingMessage, getModelId, generateContent } from "./utils.js";

const conversation = [];
let result = {};

const copyContent = async () => {
  let content = result.responseContent.replace(/\n+$/, "") + "\n\n";

  conversation.forEach((item) => {
    content += item.question.replace(/\n+$/, "") + "\n\n";
    content += item.answer.replace(/\n+$/, "") + "\n\n";
  });

  const copyStatus = document.getElementById("copy-status");

  // Copy the content to the clipboard
  await navigator.clipboard.writeText(content);
  copyStatus.textContent = chrome.i18n.getMessage("results_copied");
  setTimeout(() => copyStatus.textContent = "", 1000);
};

const askQuestion = async () => {
  // TODO: error handling
  const languageModel = document.getElementById("languageModel").value;
  const modelId = getModelId(languageModel);
  const question = document.getElementById("text").value.trim();

  if (!question) {
    return;
  }

  document.getElementById("copy").disabled = true;
  document.getElementById("text").disabled = true;
  document.getElementById("languageModel").disabled = true;
  document.getElementById("send").disabled = true;

  let displayIntervalId = setInterval(displayLoadingMessage, 500, "send-status", chrome.i18n.getMessage("results_waiting_response"));

  // Generate an answer to the question
  const apiContents = [];
  apiContents.push(result.requestApiContent);
  apiContents.push({ role: "model", parts: [{ text: result.responseContent }] });

  // Add the previous questions and answers to the conversation
  conversation.forEach((item) => {
    apiContents.push({ role: "user", parts: [{ text: item.question }] });
    apiContents.push({ role: "model", parts: [{ text: item.answer }] });
  });

  apiContents.push({ role: "user", parts: [{ text: question }] });
  const { apiKey } = await chrome.storage.local.get({ apiKey: "" });
  const response = await generateContent(modelId, apiKey, apiContents);
  const answer = response.body.candidates[0].content.parts[0].text;

  if (displayIntervalId) {
    clearInterval(displayIntervalId);
  }

  document.getElementById("send-status").textContent = "";
  document.getElementById("copy").disabled = false;
  document.getElementById("text").disabled = false;
  document.getElementById("languageModel").disabled = false;
  document.getElementById("send").disabled = false;

  // Create a new div element with the question
  const questionDiv = document.createElement("div");
  questionDiv.textContent = question;

  // Create a new div element with the formatted text
  const formattedQuestionDiv = document.createElement("div");
  formattedQuestionDiv.style.backgroundColor = "var(--nc-bg-3)";
  formattedQuestionDiv.style.borderRadius = "1rem";
  formattedQuestionDiv.style.margin = "1.5rem";
  formattedQuestionDiv.style.padding = "1rem 1rem .1rem";
  formattedQuestionDiv.innerHTML = DOMPurify.sanitize(marked.parse(questionDiv.innerHTML, { breaks: true }));

  // Append the formatted text to the conversation
  document.getElementById("conversation").appendChild(formattedQuestionDiv);
  document.getElementById("text").value = "";

  // Create a new div element with the answer
  const answerDiv = document.createElement("div");
  answerDiv.textContent = answer;

  // Create a new div element with the formatted text
  const formattedAnswerDiv = document.createElement("div");
  formattedAnswerDiv.innerHTML = DOMPurify.sanitize(marked.parse(answerDiv.innerHTML));

  // Append the formatted text to the conversation
  document.getElementById("conversation").appendChild(formattedAnswerDiv);

  // Scroll to the bottom of the page
  window.scrollTo(0, document.body.scrollHeight);

  conversation.push({ question: question, answer: answer });
};

const initialize = async () => {
  // Check if the screen is narrow
  adjustLayoutForScreenSize();

  // Disable links when converting from Markdown to HTML
  marked.use({ renderer: { link: ({ text }) => text } });

  // Set the text direction of the body
  document.body.setAttribute("dir", chrome.i18n.getMessage("@@bidi_dir"));

  // Set the text of elements with the data-i18n attribute
  document.querySelectorAll("[data-i18n]").forEach(element => {
    element.textContent = chrome.i18n.getMessage(element.getAttribute("data-i18n"));
  });

  // Restore the language code from the local storage
  const { languageModel } = await chrome.storage.local.get({ languageModel: "1.5-flash" });
  document.getElementById("languageModel").value = languageModel;

  // Set the default language model if the language model is not set
  if (!document.getElementById("languageModel").value) {
    document.getElementById("languageModel").value = "1.5-flash";
  }

  // Restore the content from the session storage
  const urlParams = new URLSearchParams(window.location.search);
  const resultIndex = urlParams.get("i");
  result = (await chrome.storage.session.get({ [`r_${resultIndex}`]: "" }))[`r_${resultIndex}`];

  // Convert the content from Markdown to HTML
  const div = document.createElement("div");
  div.textContent = result.responseContent;
  document.getElementById("content").innerHTML = DOMPurify.sanitize(marked.parse(div.innerHTML));
};

document.addEventListener("DOMContentLoaded", initialize);
document.getElementById("copy").addEventListener("click", copyContent);
document.getElementById("send").addEventListener("click", askQuestion);
window.addEventListener("resize", adjustLayoutForScreenSize);
