/* global DOMPurify, marked */

const checkNarrowScreen = () => {
  // Add the narrow class if the screen width is narrow
  if (document.getElementById("header").clientWidth < 640) {
    document.body.classList.add("narrow");
  } else {
    document.body.classList.remove("narrow");
  }
};

const copyContent = async () => {
  const content = document.getElementById("content").textContent;
  const status = document.getElementById("status");

  // Copy the content to the clipboard
  await navigator.clipboard.writeText(content);
  status.textContent = chrome.i18n.getMessage("results_copied");
  setTimeout(() => status.textContent = "", 1000);
};

const initialize = async () => {
  // Check if the screen is narrow  
  checkNarrowScreen();

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
  const contentIndex = urlParams.get("i");
  const content = (await chrome.storage.session.get({ [`c_${contentIndex}`]: "" }))[`c_${contentIndex}`];

  // Convert the content from Markdown to HTML
  const div = document.createElement("div");
  div.textContent = content;
  document.getElementById("content").innerHTML = DOMPurify.sanitize(marked.parse(div.innerHTML));
};

document.addEventListener("DOMContentLoaded", initialize);
document.getElementById("copy").addEventListener("click", copyContent);
window.addEventListener("resize", checkNarrowScreen);
