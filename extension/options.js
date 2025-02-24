import { applyTheme, adjustLayoutForScreenSize, loadTemplate } from "./utils.js";

const restoreOptions = async () => {
  const options = await chrome.storage.local.get({
    apiKey: "",
    languageModel: "2.0-flash",
    userModelId: "gemini-2.0-flash-001",
    languageCode: "en",
    userLanguage: "Turkish",
    noTextAction: "summarize",
    noTextCustomPrompt1: "",
    noTextCustomPrompt2: "",
    noTextCustomPrompt3: "",
    textAction: "translate",
    textCustomPrompt1: "",
    textCustomPrompt2: "",
    textCustomPrompt3: "",
    streaming: false,
    theme: "system"
  });

  document.getElementById("apiKey").value = options.apiKey;
  document.getElementById("languageModel").value = options.languageModel;
  document.getElementById("userModelId").value = options.userModelId;
  document.getElementById("languageCode").value = options.languageCode;
  document.getElementById("userLanguage").value = options.userLanguage;
  document.querySelector(`input[name="noTextAction"][value="${options.noTextAction}"]`).checked = true;
  document.getElementById("noTextCustomPrompt1").value = options.noTextCustomPrompt1;
  document.getElementById("noTextCustomPrompt2").value = options.noTextCustomPrompt2;
  document.getElementById("noTextCustomPrompt3").value = options.noTextCustomPrompt3;
  document.querySelector(`input[name="textAction"][value="${options.textAction}"]`).checked = true;
  document.getElementById("textCustomPrompt1").value = options.textCustomPrompt1;
  document.getElementById("textCustomPrompt2").value = options.textCustomPrompt2;
  document.getElementById("textCustomPrompt3").value = options.textCustomPrompt3;
  document.getElementById("streaming").checked = options.streaming;
  document.getElementById("theme").value = options.theme;

  // Set the default language model if the language model is not set
  if (!document.getElementById("languageModel").value) {
    document.getElementById("languageModel").value = "2.0-flash";
  }
};

const saveOptions = async () => {
  const options = {
    apiKey: document.getElementById("apiKey").value,
    languageModel: document.getElementById("languageModel").value,
    userModelId: document.getElementById("userModelId").value,
    languageCode: document.getElementById("languageCode").value,
    userLanguage: document.getElementById("userLanguage").value,
    noTextAction: document.querySelector('input[name="noTextAction"]:checked').value,
    noTextCustomPrompt1: document.getElementById("noTextCustomPrompt1").value,
    noTextCustomPrompt2: document.getElementById("noTextCustomPrompt2").value,
    noTextCustomPrompt3: document.getElementById("noTextCustomPrompt3").value,
    textAction: document.querySelector('input[name="textAction"]:checked').value,
    textCustomPrompt1: document.getElementById("textCustomPrompt1").value,
    textCustomPrompt2: document.getElementById("textCustomPrompt2").value,
    textCustomPrompt3: document.getElementById("textCustomPrompt3").value,
    streaming: document.getElementById("streaming").checked,
    theme: document.getElementById("theme").value
  };

  await chrome.storage.local.set(options);
  await chrome.storage.session.set({ responseCacheQueue: [] });
  const status = document.getElementById("status");
  status.textContent = chrome.i18n.getMessage("options_saved");
  setTimeout(() => status.textContent = "", 1000);
  applyTheme((await chrome.storage.local.get({ theme: "system" })).theme);
};

const initialize = async () => {
  // Apply the theme
  applyTheme((await chrome.storage.local.get({ theme: "system" })).theme);

  // Check if the screen is narrow  
  adjustLayoutForScreenSize();

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

  restoreOptions();
};

document.addEventListener("DOMContentLoaded", initialize);
document.getElementById("save").addEventListener("click", saveOptions);
window.addEventListener("resize", adjustLayoutForScreenSize);
