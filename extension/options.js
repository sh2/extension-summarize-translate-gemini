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
  status.textContent = "Saved.";
  setTimeout(() => status.textContent = "", 1000);
};

document.addEventListener("DOMContentLoaded", restoreOptions);
document.getElementById("save").addEventListener("click", saveOptions);
