import { describe, it, expect, vi, beforeEach } from "vitest";

// Partial mock: only the API-facing dependencies are replaced so that
// applyLanguagePlaceholder keeps its real implementation and the placeholder
// expansion performed by the worker can be verified.
vi.mock("../../extension/utils.js", async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    getModelConfigs: vi.fn(() => ({})),
    generateContent: vi.fn(async () => ({ ok: true, status: 200, body: {} })),
    streamGenerateContent: vi.fn(async () => ({ ok: true, status: 200, body: {} })),
    getResponseContent: vi.fn(() => "response"),
    getOrCreateOpenCodeSessionId: vi.fn(async () => "session"),
    createContextMenus: vi.fn(async () => {})
  };
});

const BASE_REQUEST = {
  message: "generate",
  mediaType: "text",
  languageModel: "gemini-3.5-flash",
  streamKey: "streamKey",
  resultIndex: 0,
  url: "https://example.com/",
  title: "Example"
};

const installChromeStub = (localValues) => {
  const listeners = [];
  const sessionValues = {};

  globalThis.chrome = {
    runtime: {
      onMessage: { addListener: (listener) => listeners.push(listener) },
      onStartup: { addListener: () => {} },
      onInstalled: { addListener: () => {} }
    },
    storage: {
      local: {
        get: async (defaults) => {
          const result = {};

          for (const [key, defaultValue] of Object.entries(defaults)) {
            result[key] = key in localValues ? localValues[key] : defaultValue;
          }

          return result;
        }
      },
      session: {
        get: async (defaults) => {
          const result = {};

          for (const [key, defaultValue] of Object.entries(defaults)) {
            result[key] = key in sessionValues ? sessionValues[key] : defaultValue;
          }

          return result;
        },
        set: async (items) => {
          Object.assign(sessionValues, items);
        }
      }
    },
    i18n: {
      getMessage: (key) => `message:${key}`
    }
  };

  return { listeners, sessionValues };
};

// Load the worker with a fresh module registry so that the registered message
// listener, the chrome stub, and the mocked API functions belong to one test.
const loadWorker = async (localValues) => {
  const stub = installChromeStub(localValues);
  const utils = await import("../../extension/utils.js");

  await import("../../extension/service-worker.js");

  expect(stub.listeners).toHaveLength(1);

  return { ...stub, utils, listener: stub.listeners[0] };
};

// The message listener starts the async work and returns true instead of a
// promise, so completion is awaited through sendResponse.
const runGenerate = (listener, request) => new Promise((resolve) => {
  const keptChannelOpen = listener(request, {}, resolve);

  expect(keptChannelOpen).toBe(true);
});

const getSystemPromptText = (sessionValues, resultIndex = 0) => {
  return sessionValues[`result_${resultIndex}`].requestApiContent[0].parts[0].text;
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("generate message: {{languageName}} expansion", () => {
  it("expands the placeholder in the saved custom prompt only", async () => {
    const { listener, sessionValues } = await loadWorker({
      noTextCustomPrompt1: "Explain the text and reply in {{languageName}}."
    });

    const response = await runGenerate(listener, {
      ...BASE_REQUEST,
      actionType: "noTextCustom1",
      taskInput: "Keep {{languageName}} in the input.",
      languageCode: "ja"
    });

    expect(response.ok).toBe(true);
    expect(getSystemPromptText(sessionValues)).toBe("Explain the text and reply in Japanese.");

    const apiContents = sessionValues.result_0.requestApiContent;
    expect(apiContents[1].parts[0].text).toBe("Keep {{languageName}} in the input.");
  });

  it("expands the placeholder for text custom actions as well", async () => {
    const { listener, sessionValues } = await loadWorker({
      textCustomPrompt2: "Answer in {{languageName}}."
    });

    const response = await runGenerate(listener, {
      ...BASE_REQUEST,
      actionType: "textCustom2",
      taskInput: "Selected text.",
      languageCode: "de"
    });

    expect(response.ok).toBe(true);
    expect(getSystemPromptText(sessionValues)).toBe("Answer in German.");
  });

  it("leaves the built-in summarize prompt unexpanded", async () => {
    // The language name for "zz" is the saved userLanguage, which makes the
    // built-in prompt contain the placeholder so that a wrong expansion over
    // every action would be detected as "Test Test {{languageName}}".
    const { listener, sessionValues } = await loadWorker({
      userLanguage: "Test {{languageName}}"
    });

    const response = await runGenerate(listener, {
      ...BASE_REQUEST,
      actionType: "summarize",
      taskInput: "Some text.",
      languageCode: "zz"
    });

    expect(response.ok).toBe(true);

    const systemPromptText = getSystemPromptText(sessionValues);
    expect(systemPromptText).toContain("in Test {{languageName}}.");
    expect(systemPromptText).not.toContain("Test Test {{languageName}}");
  });

  it("keeps the placeholder and skips the fallback when the language name is empty", async () => {
    const { listener, sessionValues } = await loadWorker({
      userLanguage: "",
      noTextCustomPrompt1: "Reply in {{languageName}}."
    });

    const response = await runGenerate(listener, {
      ...BASE_REQUEST,
      actionType: "noTextCustom1",
      taskInput: "Some text.",
      languageCode: "zz"
    });

    expect(response.ok).toBe(true);

    const systemPromptText = getSystemPromptText(sessionValues);
    expect(systemPromptText).toBe("Reply in {{languageName}}.");
    expect(systemPromptText).not.toContain("no custom action is set");
  });
});
