import {
  DEFAULT_LANGUAGE_MODEL,
  applyTheme,
  applyFontSize,
  loadTemplate,
  createContextMenus,
  normalizeBaseUrl,
  ensureHostPermission,
  needsHostPermissionPrompt
} from "./utils.js";

// ── Pure utilities (no DOM access, no side effects) ────────────────────────

const INITIAL_OPTIONS = {
  apiProvider: "gemini",
  apiKey: "",
  languageModel: DEFAULT_LANGUAGE_MODEL,
  userModelId: "gemini-3.5-flash",
  openaiApiKey: "",
  openaiBaseUrl: "",
  openaiModelId: "gpt-5.4-nano",
  openaiReasoningEffort: "",
  openaiThinkingType: "",
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
  contextMenus: true,
  contextMenuLabel1: "",
  contextMenuLabel2: "",
  contextMenuLabel3: "",
  contextMenuLabel1Text: "",
  contextMenuLabel2Text: "",
  contextMenuLabel3Text: "",
  streaming: false,
  renderLinks: false,
  autoSave: false,
  openResultsInTab: false,
  theme: "system",
  fontSize: "medium"
};

const SAVE_ACTION_BUTTON_IDS = ["save", "exportFile", "importFile", "syncCloud", "restoreCloud"];
const PROVIDER_SELECTED_MESSAGE_KEY = "options_provider_selected";
const SHORT_STATUS_DURATION = 1000;
const LONG_STATUS_DURATION = 3000;

const createLocalDateString = () => {
  const currentDate = new Date();
  const adjustedDate = new Date(currentDate.getTime() - currentDate.getTimezoneOffset() * 60000);

  return adjustedDate.toISOString().split("T")[0];
};

const hasOpenaiBaseUrl = (options) => {
  return options.apiProvider === "openai" && Boolean(options.openaiBaseUrl?.trim());
};

// ── UI helpers ──────────────────────────────────────────────────────────────

export const updateProviderCards = (documentRef, isGemini, selectedLabel) => {
  const geminiSection = documentRef.getElementById("geminiSection");
  const openaiSection = documentRef.getElementById("openaiSection");

  if (!geminiSection || !openaiSection) {
    return;
  }

  const geminiCard = geminiSection.closest(".card");
  const openaiCard = openaiSection.closest(".card");
  const geminiStatus = geminiSection.querySelector(".provider-status");
  const openaiStatus = openaiSection.querySelector(".provider-status");

  geminiSection.classList.toggle("is-inactive-provider", !isGemini);
  openaiSection.classList.toggle("is-inactive-provider", isGemini);

  if (geminiCard) {
    geminiCard.classList.toggle("is-inactive-provider", !isGemini);
  }

  if (openaiCard) {
    openaiCard.classList.toggle("is-inactive-provider", isGemini);
  }

  if (geminiStatus) {
    geminiStatus.textContent = isGemini ? selectedLabel : "";
  }

  if (openaiStatus) {
    openaiStatus.textContent = isGemini ? "" : selectedLabel;
  }
};

export const createPersistentStatusUpdater = (persistentStatusElement, syncHeight, requestFrame, cancelFrame) => {
  let pendingFrameId = null;

  const cancelPendingFrame = () => {
    if (pendingFrameId !== null) {
      cancelFrame(pendingFrameId);
      pendingFrameId = null;
    }
  };

  return {
    setPersistentStatus(message) {
      cancelPendingFrame();
      persistentStatusElement.hidden = false;
      persistentStatusElement.textContent = "";

      pendingFrameId = requestFrame(() => {
        pendingFrameId = null;
        persistentStatusElement.textContent = message;
        syncHeight();
      });
    },
    clearPersistentStatus() {
      cancelPendingFrame();
      persistentStatusElement.textContent = "";
      persistentStatusElement.hidden = true;
      syncHeight();
    }
  };
};

const showStatusMessage = (statusElement, message, duration) => {
  if (!statusElement) {
    return;
  }

  statusElement.textContent = message;

  setTimeout(() => {
    if (statusElement.textContent === message) {
      statusElement.textContent = "";
    }
  }, duration);
};

const setActionButtonsDisabled = (documentRef, disabled) => {
  SAVE_ACTION_BUTTON_IDS.forEach((elementId) => {
    const element = documentRef.getElementById(elementId);

    if (element) {
      element.disabled = disabled;
    }
  });
};

const applyLocalizedText = (documentRef) => {
  documentRef.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = chrome.i18n.getMessage(element.getAttribute("data-i18n"));
  });

  documentRef.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.setAttribute("placeholder", chrome.i18n.getMessage(element.getAttribute("data-i18n-placeholder")));
  });
};

const setDynamicControlDescriptions = (documentRef) => {
  const languageModel = documentRef.getElementById("languageModel");

  if (languageModel) {
    languageModel.setAttribute("aria-describedby", "languageModelHint");
  }
};

const syncSaveBarHeight = (documentRef) => {
  const saveBar = documentRef.querySelector(".save-bar");

  if (!saveBar) {
    return;
  }

  documentRef.documentElement.style.setProperty(
    "--save-bar-height",
    `${Math.ceil(saveBar.getBoundingClientRect().height)}px`
  );
};

const initSaveBarHeight = (documentRef, windowRef) => {
  const saveBar = documentRef.querySelector(".save-bar");

  if (!saveBar) {
    return;
  }

  const syncHeight = () => {
    syncSaveBarHeight(documentRef);
  };

  syncHeight();

  if (typeof windowRef.ResizeObserver === "function") {
    const resizeObserver = new windowRef.ResizeObserver(() => {
      syncHeight();
    });

    resizeObserver.observe(saveBar);
    return;
  }

  windowRef.addEventListener("resize", () => {
    syncHeight();
  });

  if (typeof windowRef.MutationObserver === "function") {
    const mutationObserver = new windowRef.MutationObserver(() => {
      syncHeight();
    });

    mutationObserver.observe(saveBar, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden"]
    });
  }
};

const updateProviderUI = () => {
  const selectedProvider = document.querySelector('input[name="apiProvider"]:checked');

  if (!selectedProvider) {
    return;
  }

  updateProviderCards(
    document,
    selectedProvider.value === "gemini",
    chrome.i18n.getMessage(PROVIDER_SELECTED_MESSAGE_KEY)
  );
};

const updateScrollSpy = () => {
  const links = Array.from(document.querySelectorAll(".sidebar a"));

  if (links.length === 0) {
    return;
  }

  const sections = links.map((link) => {
    return document.querySelector(link.getAttribute("href"));
  });

  const header = document.querySelector("header");
  const threshold = (header ? header.getBoundingClientRect().height : 0) + 16;
  let currentIndex = 0;

  sections.forEach((section, index) => {
    if (section && section.getBoundingClientRect().top <= threshold) {
      currentIndex = index;
    }
  });

  links.forEach((link, index) => {
    const isCurrent = index === currentIndex;

    link.classList.toggle("active", isCurrent);

    if (isCurrent) {
      link.setAttribute("aria-current", "location");
    } else {
      link.removeAttribute("aria-current");
    }
  });
};

const downloadOptionsToFile = (options) => {
  const blob = new Blob([JSON.stringify(options, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = `summarize-translate-gemini_${createLocalDateString()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
};

// ── Button action handlers ─────────────────────────────────────────────────

export const createOptionsActionHandlers = ({
  getIsInitialized,
  saveWithHostPermission,
  clearPersistentStatus,
  setPersistentStatus,
  showStatus,
  getMessage,
  getOptions,
  isExportApiKeyEnabled,
  downloadOptions,
  syncOptions,
  getCloudOptions,
  createImportInput,
  applyOptions,
  needsPermissionPromptForOptions,
  logError,
  logInfo
}) => {
  const saveIfInitialized = async () => {
    if (!getIsInitialized()) {
      return { status: "blocked" };
    }

    return saveWithHostPermission();
  };

  const handleSaveClick = async () => {
    const saveResult = await saveIfInitialized();

    if (saveResult.status !== "granted") {
      return;
    }

    clearPersistentStatus();
    showStatus(getMessage("options_saved"), SHORT_STATUS_DURATION);
  };

  const handleExportClick = async () => {
    const saveResult = await saveIfInitialized();

    if (saveResult.status !== "granted") {
      return;
    }

    clearPersistentStatus();
    showStatus(getMessage("options_saved"), SHORT_STATUS_DURATION);
    downloadOptions(getOptions(isExportApiKeyEnabled()));
  };

  const handleSyncClick = async () => {
    const saveResult = await saveIfInitialized();

    if (saveResult.status !== "granted") {
      return;
    }

    clearPersistentStatus();

    try {
      await syncOptions(getOptions(true));
      showStatus(getMessage("options_sync_cloud_started"), SHORT_STATUS_DURATION);
    } catch (error) {
      showStatus(getMessage("options_sync_cloud_failed"), LONG_STATUS_DURATION);
      logError("Failed to sync options to cloud:", error);
    }
  };

  const saveImportedOrRestoredOptions = async (successMessageKey) => {
    const currentOptions = getOptions(true);

    if (await needsPermissionPromptForOptions(currentOptions)) {
      setPersistentStatus(getMessage("options_save_required_for_host_permission"));
      return;
    }

    const saveResult = await saveIfInitialized();

    if (saveResult.status !== "granted") {
      return;
    }

    clearPersistentStatus();
    showStatus(getMessage(successMessageKey), SHORT_STATUS_DURATION);
  };

  const handleImportClick = () => {
    if (!getIsInitialized()) {
      return;
    }

    const input = createImportInput();
    input.type = "file";
    input.accept = ".json";

    input.addEventListener("change", async () => {
      const file = input.files?.[0];

      if (!file) {
        return;
      }

      try {
        const text = await file.text();
        const options = JSON.parse(text);

        applyOptions(options);
        await saveImportedOrRestoredOptions("options_import_succeeded");
      } catch (error) {
        showStatus(getMessage("options_import_failed"), LONG_STATUS_DURATION);
        logInfo(error);
      }
    });

    input.click();
  };

  const handleRestoreClick = async () => {
    if (!getIsInitialized()) {
      return;
    }

    const options = await getCloudOptions();

    applyOptions(options);
    await saveImportedOrRestoredOptions("options_restore_cloud_succeeded");
  };

  return {
    handleSaveClick,
    handleExportClick,
    handleImportClick,
    handleSyncClick,
    handleRestoreClick
  };
};

// ── Core async logic ────────────────────────────────────────────────────────

const getOptionsFromForm = (includeApiKey) => {
  const options = {
    version: chrome.runtime.getManifest().version,
    apiProvider: document.querySelector('input[name="apiProvider"]:checked').value,
    languageModel: document.getElementById("languageModel").value,
    userModelId: document.getElementById("userModelId").value,
    openaiBaseUrl: document.getElementById("openaiBaseUrl").value,
    openaiModelId: document.getElementById("openaiModelId").value,
    openaiReasoningEffort: document.getElementById("openaiReasoningEffort").value,
    openaiThinkingType: document.getElementById("openaiThinkingType").value,
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
    contextMenuLabel1Text: document.getElementById("contextMenuLabel1Text").value,
    contextMenuLabel2Text: document.getElementById("contextMenuLabel2Text").value,
    contextMenuLabel3Text: document.getElementById("contextMenuLabel3Text").value,
    streaming: document.getElementById("streaming").checked,
    renderLinks: document.getElementById("renderLinks").checked,
    autoSave: document.getElementById("autoSave").checked,
    openResultsInTab: document.getElementById("openResultsInTab").checked,
    theme: document.getElementById("theme").value,
    fontSize: document.getElementById("fontSize").value
  };

  if (includeApiKey) {
    options.apiKey = document.getElementById("apiKey").value;
    options.openaiApiKey = document.getElementById("openaiApiKey").value;
  }

  return options;
};

const setOptionsToForm = async () => {
  const options = await chrome.storage.local.get(INITIAL_OPTIONS);

  document.querySelector(`input[name="apiProvider"][value="${options.apiProvider}"]`).checked = true;
  document.getElementById("apiKey").value = options.apiKey;
  document.getElementById("languageModel").value = options.languageModel;
  document.getElementById("userModelId").value = options.userModelId;
  document.getElementById("openaiApiKey").value = options.openaiApiKey;
  document.getElementById("openaiBaseUrl").value = options.openaiBaseUrl;
  document.getElementById("openaiModelId").value = options.openaiModelId;
  document.getElementById("openaiReasoningEffort").value = options.openaiReasoningEffort;
  document.getElementById("openaiThinkingType").value = options.openaiThinkingType;
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
  document.getElementById("contextMenus").checked = options.contextMenus;
  document.getElementById("contextMenuLabel1").value = options.contextMenuLabel1;
  document.getElementById("contextMenuLabel2").value = options.contextMenuLabel2;
  document.getElementById("contextMenuLabel3").value = options.contextMenuLabel3;
  document.getElementById("contextMenuLabel1Text").value = options.contextMenuLabel1Text;
  document.getElementById("contextMenuLabel2Text").value = options.contextMenuLabel2Text;
  document.getElementById("contextMenuLabel3Text").value = options.contextMenuLabel3Text;
  document.getElementById("streaming").checked = options.streaming;
  document.getElementById("renderLinks").checked = options.renderLinks;
  document.getElementById("autoSave").checked = options.autoSave;
  document.getElementById("openResultsInTab").checked = options.openResultsInTab;
  document.getElementById("theme").value = options.theme;
  document.getElementById("fontSize").value = options.fontSize;

  if (!document.getElementById("languageModel").value) {
    document.getElementById("languageModel").value = DEFAULT_LANGUAGE_MODEL;
  }

  updateProviderUI();
};

const applyOptionsToForm = (options) => {
  if (options.apiProvider) {
    const providerElement = document.querySelector(`input[name="apiProvider"][value="${options.apiProvider}"]`);

    if (providerElement) {
      providerElement.checked = true;
    }
  }

  if (options.apiKey) {
    document.getElementById("apiKey").value = options.apiKey;
  }

  if (options.languageModel) {
    document.getElementById("languageModel").value = options.languageModel;
  }

  if (options.userModelId !== undefined) {
    document.getElementById("userModelId").value = options.userModelId;
  }

  if (options.openaiApiKey) {
    document.getElementById("openaiApiKey").value = options.openaiApiKey;
  }

  if (options.openaiBaseUrl !== undefined) {
    document.getElementById("openaiBaseUrl").value = options.openaiBaseUrl;
  }

  if (options.openaiModelId !== undefined) {
    document.getElementById("openaiModelId").value = options.openaiModelId;
  }

  if (options.openaiReasoningEffort !== undefined) {
    document.getElementById("openaiReasoningEffort").value = options.openaiReasoningEffort;
  }

  if (options.openaiThinkingType !== undefined) {
    document.getElementById("openaiThinkingType").value = options.openaiThinkingType;
  }

  if (options.languageCode) {
    document.getElementById("languageCode").value = options.languageCode;
  }

  if (options.userLanguage !== undefined) {
    document.getElementById("userLanguage").value = options.userLanguage;
  }

  if (options.noTextAction) {
    const noTextActionElement = document.querySelector(`input[name="noTextAction"][value="${options.noTextAction}"]`);

    if (noTextActionElement) {
      noTextActionElement.checked = true;
    }
  }

  if (options.noTextCustomPrompt1 !== undefined) {
    document.getElementById("noTextCustomPrompt1").value = options.noTextCustomPrompt1;
  }

  if (options.noTextCustomPrompt2 !== undefined) {
    document.getElementById("noTextCustomPrompt2").value = options.noTextCustomPrompt2;
  }

  if (options.noTextCustomPrompt3 !== undefined) {
    document.getElementById("noTextCustomPrompt3").value = options.noTextCustomPrompt3;
  }

  if (options.textAction) {
    const textActionElement = document.querySelector(`input[name="textAction"][value="${options.textAction}"]`);

    if (textActionElement) {
      textActionElement.checked = true;
    }
  }

  if (options.textCustomPrompt1 !== undefined) {
    document.getElementById("textCustomPrompt1").value = options.textCustomPrompt1;
  }

  if (options.textCustomPrompt2 !== undefined) {
    document.getElementById("textCustomPrompt2").value = options.textCustomPrompt2;
  }

  if (options.textCustomPrompt3 !== undefined) {
    document.getElementById("textCustomPrompt3").value = options.textCustomPrompt3;
  }

  if (options.contextMenus !== undefined) {
    document.getElementById("contextMenus").checked = options.contextMenus;
  }

  if (options.contextMenuLabel1 !== undefined) {
    document.getElementById("contextMenuLabel1").value = options.contextMenuLabel1;
  }

  if (options.contextMenuLabel2 !== undefined) {
    document.getElementById("contextMenuLabel2").value = options.contextMenuLabel2;
  }

  if (options.contextMenuLabel3 !== undefined) {
    document.getElementById("contextMenuLabel3").value = options.contextMenuLabel3;
  }

  if (options.contextMenuLabel1Text !== undefined) {
    document.getElementById("contextMenuLabel1Text").value = options.contextMenuLabel1Text;
  }

  if (options.contextMenuLabel2Text !== undefined) {
    document.getElementById("contextMenuLabel2Text").value = options.contextMenuLabel2Text;
  }

  if (options.contextMenuLabel3Text !== undefined) {
    document.getElementById("contextMenuLabel3Text").value = options.contextMenuLabel3Text;
  }

  if (options.streaming !== undefined) {
    document.getElementById("streaming").checked = options.streaming;
  }

  if (options.renderLinks !== undefined) {
    document.getElementById("renderLinks").checked = options.renderLinks;
  }

  if (options.autoSave !== undefined) {
    document.getElementById("autoSave").checked = options.autoSave;
  }

  if (options.openResultsInTab !== undefined) {
    document.getElementById("openResultsInTab").checked = options.openResultsInTab;
  }

  if (options.theme) {
    document.getElementById("theme").value = options.theme;
  }

  if (options.fontSize) {
    document.getElementById("fontSize").value = options.fontSize;
  }

  if (!document.getElementById("languageModel").value) {
    document.getElementById("languageModel").value = DEFAULT_LANGUAGE_MODEL;
  }

  updateProviderUI();
};

const saveOptions = async (options = getOptionsFromForm(true)) => {
  if (hasOpenaiBaseUrl(options)) {
    try {
      options.openaiBaseUrl = normalizeBaseUrl(options.openaiBaseUrl);
      document.getElementById("openaiBaseUrl").value = options.openaiBaseUrl;
    } catch {
      // Keep the raw value when the URL is invalid.
    }
  }

  await chrome.storage.local.set(options);
  await chrome.storage.session.set({ responseCacheQueue: [] });

  await createContextMenus(
    options.contextMenus,
    options.contextMenuLabel1,
    options.contextMenuLabel2,
    options.contextMenuLabel3,
    options.contextMenuLabel1Text,
    options.contextMenuLabel2Text,
    options.contextMenuLabel3Text
  );

  applyTheme(options.theme || "system");
  applyFontSize(options.fontSize || "medium");
  syncSaveBarHeight(document);
};

export const createHostPermissionSaveGuard = ({
  getOptions,
  ensurePermission,
  save,
  setPersistentStatus,
  getMessage,
  logError
}) => {
  return {
    async saveWithHostPermission() {
      const options = getOptions(true);

      if (hasOpenaiBaseUrl(options)) {
        const permissionResult = await ensurePermission(options.openaiBaseUrl);

        if (permissionResult.status === "denied") {
          setPersistentStatus(getMessage("options_save_required_for_host_permission"));
          return permissionResult;
        }

        if (permissionResult.status === "error") {
          setPersistentStatus(getMessage("options_host_permission_request_failed"));
          logError("Failed to request host permission:", permissionResult.error);
          return permissionResult;
        }
      }

      await save(options);
      return { status: "granted" };
    }
  };
};

const needsPermissionPromptForOptions = async (options) => {
  return hasOpenaiBaseUrl(options) && await needsHostPermissionPrompt(options.openaiBaseUrl);
};

const initialize = async (setPersistentStatus) => {
  applyTheme((await chrome.storage.local.get({ theme: "system" })).theme);
  applyFontSize((await chrome.storage.local.get({ fontSize: "medium" })).fontSize);
  document.body.setAttribute("dir", chrome.i18n.getMessage("@@bidi_dir"));

  const languageModelTemplate = await loadTemplate("languageModelTemplate");
  const languageCodeTemplate = await loadTemplate("languageCodeTemplate");

  if (!languageModelTemplate || !languageCodeTemplate) {
    setPersistentStatus(chrome.i18n.getMessage("options_initialization_failed"));
    return false;
  }

  document.getElementById("languageModelContainer").appendChild(languageModelTemplate);
  document.getElementById("languageCodeContainer").appendChild(languageCodeTemplate);
  setDynamicControlDescriptions(document);
  applyLocalizedText(document);
  await setOptionsToForm();
  initSaveBarHeight(document, window);
  syncSaveBarHeight(document);

  return true;
};

// ── Event listeners ─────────────────────────────────────────────────────────

let isOptionsPageInitialized = false;
let isScrollSpyInitialized = false;

const handleDomContentLoaded = async () => {
  const statusElement = document.getElementById("status");
  const persistentStatusElement = document.getElementById("persistentStatus");

  const requestFrame = typeof window.requestAnimationFrame === "function"
    ? window.requestAnimationFrame.bind(window)
    : (callback) => window.setTimeout(callback, 0);

  const cancelFrame = typeof window.cancelAnimationFrame === "function"
    ? window.cancelAnimationFrame.bind(window)
    : (frameId) => window.clearTimeout(frameId);

  const { setPersistentStatus, clearPersistentStatus } = createPersistentStatusUpdater(
    persistentStatusElement,
    () => {
      syncSaveBarHeight(document);
    },
    requestFrame,
    cancelFrame
  );

  setActionButtonsDisabled(document, true);

  const initialized = await initialize(setPersistentStatus);

  if (!initialized) {
    return;
  }

  const { saveWithHostPermission } = createHostPermissionSaveGuard({
    getOptions: getOptionsFromForm,
    ensurePermission: ensureHostPermission,
    save: saveOptions,
    setPersistentStatus,
    getMessage: (key) => chrome.i18n.getMessage(key),
    logError: console.error
  });

  const {
    handleSaveClick,
    handleExportClick,
    handleImportClick,
    handleSyncClick,
    handleRestoreClick
  } = createOptionsActionHandlers({
    getIsInitialized: () => isOptionsPageInitialized,
    saveWithHostPermission,
    clearPersistentStatus,
    setPersistentStatus,
    showStatus: (message, duration) => {
      showStatusMessage(statusElement, message, duration);
    },
    getMessage: (key) => chrome.i18n.getMessage(key),
    getOptions: getOptionsFromForm,
    isExportApiKeyEnabled: () => document.getElementById("exportApiKey").checked,
    downloadOptions: downloadOptionsToFile,
    syncOptions: (options) => chrome.storage.sync.set(options),
    getCloudOptions: () => chrome.storage.sync.get(),
    createImportInput: () => document.createElement("input"),
    applyOptions: applyOptionsToForm,
    needsPermissionPromptForOptions,
    logError: console.error,
    logInfo: console.log
  });

  document.querySelectorAll('input[name="apiProvider"]').forEach((radio) => {
    radio.addEventListener("change", updateProviderUI);
  });

  document.getElementById("save").addEventListener("click", handleSaveClick);
  document.getElementById("exportFile").addEventListener("click", handleExportClick);
  document.getElementById("importFile").addEventListener("click", handleImportClick);
  document.getElementById("syncCloud").addEventListener("click", handleSyncClick);
  document.getElementById("restoreCloud").addEventListener("click", handleRestoreClick);

  if (!isScrollSpyInitialized) {
    window.addEventListener("scroll", updateScrollSpy, { passive: true });
    window.addEventListener("resize", updateScrollSpy);

    document.querySelectorAll(".sidebar a").forEach((link) => {
      link.addEventListener("click", () => {
        requestFrame(() => {
          updateScrollSpy();
        });
      });
    });

    isScrollSpyInitialized = true;
  }

  isOptionsPageInitialized = true;
  setActionButtonsDisabled(document, false);
  updateScrollSpy();
};

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", handleDomContentLoaded);
}