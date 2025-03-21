import {
  applyTheme,
  adjustLayoutForScreenSize,
  loadTemplate,
  createContextMenus
} from "./utils.js";

const restoreOptions = async () => {
  const options = await chrome.storage.local.get({
    apiKey: "",
    languageModel: "2.0-flash",
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
    streaming: false,
    theme: "system"
  });

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
    contextMenus: document.getElementById("contextMenus").checked,
    streaming: document.getElementById("streaming").checked,
    theme: document.getElementById("theme").value
  };

  await chrome.storage.local.set(options);
  await chrome.storage.session.set({ responseCacheQueue: [] });
  await createContextMenus(options.contextMenus);
  applyTheme((await chrome.storage.local.get({ theme: "system" })).theme);
  const status = document.getElementById("status");
  status.textContent = chrome.i18n.getMessage("options_saved");
  setTimeout(() => status.textContent = "", 1000);
};

const exportOptions = async () => {
  await saveOptions();

  const options = await chrome.storage.local.get({
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
    streaming: document.getElementById("streaming").checked,
    theme: document.getElementById("theme").value
  });

  if (document.getElementById("exportApiKey").checked) {
    options.apiKey = document.getElementById("apiKey").value;
  }

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

const importOptions = async () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";

  input.addEventListener("change", async () => {
    const file = input.files[0];
    const text = await file.text();
    let options = {};

    try {
      options = JSON.parse(text);
    } catch (error) {
      const status = document.getElementById("status");
      status.textContent = chrome.i18n.getMessage("options_import_failed");
      setTimeout(() => status.textContent = "", 3000);
      console.log(error);
      return;
    }

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

    if (options.streaming !== undefined) {
      document.getElementById("streaming").checked = options.streaming;
    }

    if (options.theme) {
      document.getElementById("theme").value = options.theme;
    }

    saveOptions();
  });

  input.click();
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

document.getElementById("export").addEventListener("click", (event) => {
  event.preventDefault();
  exportOptions();
});

document.getElementById("import").addEventListener("click", (event) => {
  event.preventDefault();
  importOptions();
});

window.addEventListener("resize", adjustLayoutForScreenSize);
