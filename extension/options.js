import {
  applyTheme,
  applyFontSize,
  loadTemplate,
  createContextMenus
} from "./utils.js";

const INITIAL_OPTIONS = {
  apiKey: "",
  languageModel: "2.5-flash:0",
  userModelId: "gemini-2.0-flash-001",
  languageCode: "en",
  userLanguage: "Turkish",
  noTextAction: "summarize",
  noTextCustomPrompt: "",
  noTextCustomPrompt1: "",
  noTextCustomPrompt2: "",
  noTextCustomPrompt3: "",
  textAction: "translate",
  textCustomPrompt: "",
  textCustomPrompt1: "",
  textCustomPrompt2: "",
  textCustomPrompt3: "",
  contextMenus: true,
  contextMenuLabel1: "",
  contextMenuLabel2: "",
  contextMenuLabel3: "",
  streaming: false,
  theme: "system",
  fontSize: "medium"
};

const showStatusMessage = (message, duration) => {
  const status = document.getElementById("status");
  status.textContent = message;

  setTimeout(() => {
    if (status.textContent === message) {
      status.textContent = "";
    }
  }, duration);
};

const getOptionsFromForm = (includeApiKey) => {
  const options = {
    version: chrome.runtime.getManifest().version,
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
    contextMenus: document.getElementById("contextMenus").checked,
    contextMenuLabel1: document.getElementById("contextMenuLabel1").value,
    contextMenuLabel2: document.getElementById("contextMenuLabel2").value,
    contextMenuLabel3: document.getElementById("contextMenuLabel3").value,
    streaming: document.getElementById("streaming").checked,
    theme: document.getElementById("theme").value,
    fontSize: document.getElementById("fontSize").value
  };

  if (includeApiKey) {
    options.apiKey = document.getElementById("apiKey").value;
  }

  return options;
};

const setOptionsToForm = async () => {
  const options = await chrome.storage.local.get(INITIAL_OPTIONS);

  document.getElementById("apiKey").value = options.apiKey;
  document.getElementById("languageModel").value = options.languageModel;
  document.getElementById("userModelId").value = options.userModelId;
  document.getElementById("languageCode").value = options.languageCode;
  document.getElementById("userLanguage").value = options.userLanguage;
  document.querySelector(`input[name="noTextAction"][value="${options.noTextAction}"]`).checked = true;

  if (options.noTextCustomPrompt && !options.noTextCustomPrompt1) {
    // Restore the prompt of the previous version
    document.getElementById("noTextCustomPrompt1").value = options.noTextCustomPrompt;
  } else {
    document.getElementById("noTextCustomPrompt1").value = options.noTextCustomPrompt1;
  }

  document.getElementById("noTextCustomPrompt2").value = options.noTextCustomPrompt2;
  document.getElementById("noTextCustomPrompt3").value = options.noTextCustomPrompt3;
  document.querySelector(`input[name="textAction"][value="${options.textAction}"]`).checked = true;

  if (options.textCustomPrompt && !options.textCustomPrompt1) {
    // Restore the prompt of the previous version
    document.getElementById("textCustomPrompt1").value = options.textCustomPrompt;
  } else {
    document.getElementById("textCustomPrompt1").value = options.textCustomPrompt1;
  }

  document.getElementById("textCustomPrompt2").value = options.textCustomPrompt2;
  document.getElementById("textCustomPrompt3").value = options.textCustomPrompt3;
  document.getElementById("contextMenus").checked = options.contextMenus;
  document.getElementById("contextMenuLabel1").value = options.contextMenuLabel1;
  document.getElementById("contextMenuLabel2").value = options.contextMenuLabel2;
  document.getElementById("contextMenuLabel3").value = options.contextMenuLabel3;
  document.getElementById("streaming").checked = options.streaming;
  document.getElementById("theme").value = options.theme;
  document.getElementById("fontSize").value = options.fontSize;

  // Set the default language model if the language model is not set
  if (!document.getElementById("languageModel").value) {
    document.getElementById("languageModel").value = "2.5-flash:0";
  }
};

const applyOptionsToForm = (options) => {
  // apiKey does not allow an empty string
  if (options.apiKey) {
    document.getElementById("apiKey").value = options.apiKey;
  }

  if (options.languageModel) {
    document.getElementById("languageModel").value = options.languageModel;
  }

  // userModelId allows an empty string
  if (options.userModelId !== undefined) {
    document.getElementById("userModelId").value = options.userModelId;
  }

  if (options.languageCode) {
    document.getElementById("languageCode").value = options.languageCode;
  }

  // userLanguage allows an empty string
  if (options.userLanguage !== undefined) {
    document.getElementById("userLanguage").value = options.userLanguage;
  }

  if (options.noTextAction) {
    const noTextActionElement = document.querySelector(`input[name="noTextAction"][value="${options.noTextAction}"]`);

    if (noTextActionElement) {
      noTextActionElement.checked = true;
    }
  }

  // noTextCustomPrompt1 allows an empty string
  if (options.noTextCustomPrompt1 !== undefined) {
    document.getElementById("noTextCustomPrompt1").value = options.noTextCustomPrompt1;
  }

  // noTextCustomPrompt2 allows an empty string
  if (options.noTextCustomPrompt2 !== undefined) {
    document.getElementById("noTextCustomPrompt2").value = options.noTextCustomPrompt2;
  }

  // noTextCustomPrompt3 allows an empty string
  if (options.noTextCustomPrompt3 !== undefined) {
    document.getElementById("noTextCustomPrompt3").value = options.noTextCustomPrompt3;
  }

  if (options.textAction) {
    const textActionElement = document.querySelector(`input[name="textAction"][value="${options.textAction}"]`);

    if (textActionElement) {
      textActionElement.checked = true;
    }
  }

  // textCustomPrompt1 allows an empty string
  if (options.textCustomPrompt1 !== undefined) {
    document.getElementById("textCustomPrompt1").value = options.textCustomPrompt1;
  }

  // textCustomPrompt2 allows an empty string
  if (options.textCustomPrompt2 !== undefined) {
    document.getElementById("textCustomPrompt2").value = options.textCustomPrompt2;
  }

  // textCustomPrompt3 allows an empty string
  if (options.textCustomPrompt3 !== undefined) {
    document.getElementById("textCustomPrompt3").value = options.textCustomPrompt3;
  }

  if (options.contextMenus !== undefined) {
    document.getElementById("contextMenus").checked = options.contextMenus;
  }

  // contextMenuLabel1 allows an empty string
  if (options.contextMenuLabel1 !== undefined) {
    document.getElementById("contextMenuLabel1").value = options.contextMenuLabel1;
  }

  // contextMenuLabel2 allows an empty string
  if (options.contextMenuLabel2 !== undefined) {
    document.getElementById("contextMenuLabel2").value = options.contextMenuLabel2;
  }

  // contextMenuLabel3 allows an empty string
  if (options.contextMenuLabel3 !== undefined) {
    document.getElementById("contextMenuLabel3").value = options.contextMenuLabel3;
  }

  if (options.streaming !== undefined) {
    document.getElementById("streaming").checked = options.streaming;
  }

  if (options.theme) {
    document.getElementById("theme").value = options.theme;
  }

  if (options.fontSize) {
    document.getElementById("fontSize").value = options.fontSize;
  }

  // Set the default language model if the language model is not set
  if (!document.getElementById("languageModel").value) {
    document.getElementById("languageModel").value = "2.5-flash:0";
  }
};

const saveOptions = async () => {
  const options = getOptionsFromForm(true);

  await chrome.storage.local.set(options);
  await chrome.storage.session.set({ responseCacheQueue: [] });

  await createContextMenus(
    options.contextMenus,
    options.contextMenuLabel1,
    options.contextMenuLabel2,
    options.contextMenuLabel3
  );

  applyTheme((await chrome.storage.local.get({ theme: "system" })).theme);
  applyFontSize((await chrome.storage.local.get({ fontSize: "medium" })).fontSize);
};

const exportOptionsToFile = async () => {
  await saveOptions();
  showStatusMessage(chrome.i18n.getMessage("options_saved"), 1000);

  const options = getOptionsFromForm(document.getElementById("exportApiKey").checked);
  const currentDate = new Date();
  const adjustedDate = new Date(currentDate.getTime() - currentDate.getTimezoneOffset() * 60000);
  const localDateString = adjustedDate.toISOString().split("T")[0];
  const blob = new Blob([JSON.stringify(options, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `summarize-translate-gemini_${localDateString}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

const syncOptionsToCloud = async () => {
  await saveOptions();

  const options = getOptionsFromForm(true);

  try {
    await chrome.storage.sync.set(options);
    showStatusMessage(chrome.i18n.getMessage("options_sync_cloud_started"), 1000);
  } catch (error) {
    showStatusMessage(chrome.i18n.getMessage("options_sync_cloud_failed"), 3000);
    console.log(error);
  }
};

const importOptionsFromFile = async () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";

  input.addEventListener("change", async () => {
    const file = input.files[0];
    const text = await file.text();
    let options = {};

    try {
      options = JSON.parse(text);
      applyOptionsToForm(options);
      await saveOptions();
      showStatusMessage(chrome.i18n.getMessage("options_import_succeeded"), 1000);
    } catch (error) {
      showStatusMessage(chrome.i18n.getMessage("options_import_failed"), 3000);
      console.log(error);
    }
  });

  input.click();
};

const restoreOptionsFromCloud = async () => {
  const options = await chrome.storage.sync.get();

  applyOptionsToForm(options);
  await saveOptions();
  showStatusMessage(chrome.i18n.getMessage("options_restore_cloud_succeeded"), 1000);
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

  setOptionsToForm();
};

document.addEventListener("DOMContentLoaded", initialize);

document.getElementById("save").addEventListener("click", async () => {
  await saveOptions();
  showStatusMessage(chrome.i18n.getMessage("options_saved"), 1000);
});

document.getElementById("exportFile").addEventListener("click", (event) => {
  event.preventDefault();
  exportOptionsToFile();
});

document.getElementById("importFile").addEventListener("click", (event) => {
  event.preventDefault();
  importOptionsFromFile();
});

document.getElementById("syncCloud").addEventListener("click", (event) => {
  event.preventDefault();
  syncOptionsToCloud();
});

document.getElementById("restoreCloud").addEventListener("click", (event) => {
  event.preventDefault();
  restoreOptionsFromCloud();
});
