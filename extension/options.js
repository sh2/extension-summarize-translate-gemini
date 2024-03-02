const restoreOptions = async () => {
  const options = await chrome.storage.local.get({
    apiKey: "",
    languageCode: "en"
  });

  document.getElementById("apiKey").value = options.apiKey;
  document.getElementById("languageCode").value = options.languageCode;
};

const saveOptions = async () => {
  const options = {
    apiKey: document.getElementById("apiKey").value,
    languageCode: document.getElementById("languageCode").value
  };

  await chrome.storage.local.set(options);
  const status = document.getElementById("status");
  status.textContent = chrome.i18n.getMessage("options_saved");
  setTimeout(() => status.textContent = "", 1000);
};

const initialize = () => {
  // Set the text of elements with the data-i18n attribute
  document.querySelectorAll("[data-i18n]").forEach(element => {
    element.textContent = chrome.i18n.getMessage(element.getAttribute("data-i18n"));
  });

  restoreOptions();
}

document.addEventListener("DOMContentLoaded", initialize);
document.getElementById("save").addEventListener("click", saveOptions);
