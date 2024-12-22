/* global DOMPurify, marked */

import { adjustLayoutForScreenSize, generateContent } from "./utils.js";

const conversation = [];
let result = {};

const copyContent = async () => {
  // TODO: answer should be copied as well
  const content = document.getElementById("content").textContent;
  const status = document.getElementById("status");

  // Copy the content to the clipboard
  await navigator.clipboard.writeText(content);
  status.textContent = chrome.i18n.getMessage("results_copied");
  setTimeout(() => status.textContent = "", 1000);
};

const askQuestion = async () => {
  // TODO: modelId should be retrieved from the user settings
  // TODO: disable the button while waiting for the answer
  // TODO: display waiting message while waiting for the answer
  // TODO: scroll to the bottom of the conversation
  // TODO: error handling
  const question = document.getElementById("question-text").value.trim();

  if (!question) {
    return;
  }

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
  document.getElementById("question-text").value = "";

  // Generate an answer to the question
  const apiContents = [];
  apiContents.push(result.requestApiContent);
  apiContents.push({ role: "model", parts: [{ text: result.responseContent }] });

  // conversationの中身をapiContentsに追加
  conversation.forEach((item) => {
    apiContents.push({ role: "user", parts: [{ text: item.question }] });
    apiContents.push({ role: "model", parts: [{ text: item.answer }] });
  });

  apiContents.push({ role: "user", parts: [{ text: question }] });
  const { apiKey } = await chrome.storage.local.get({ apiKey: "" });
  const response = await generateContent("gemini-2.0-flash-exp", apiKey, apiContents);
  const answer = response.body.candidates[0].content.parts[0].text;

  // Create a new div element with the answer
  const answerDiv = document.createElement("div");
  answerDiv.textContent = answer;

  // Create a new div element with the formatted text
  const formattedAnswerDiv = document.createElement("div");
  formattedAnswerDiv.innerHTML = DOMPurify.sanitize(marked.parse(answerDiv.innerHTML));

  // Append the formatted text to the conversation
  document.getElementById("conversation").appendChild(formattedAnswerDiv);

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
document.getElementById("question-send").addEventListener("click", askQuestion);
window.addEventListener("resize", adjustLayoutForScreenSize);
