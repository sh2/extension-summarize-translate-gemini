import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { streamGenerateContent } from "../../extension/utils.js";
import { installChromeStorageSessionMock } from "../helpers/chrome-storage-mock.js";
import { createStreamResponse, installFetchMock } from "../helpers/fetch-mock.js";

const DUMMY_API_KEY = "test-api-key";
const STREAM_KEY = "test-stream-key";
const RETRY_KEY = "test-retry-key";

const GEMINI_STREAM_ENDPOINT = (modelId) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent`;

let mock;
let storage;

beforeEach(() => {
  mock = installFetchMock();
  storage = installChromeStorageSessionMock();
});

afterEach(() => {
  vi.useRealTimers();
  mock.restore();
  storage.restore();
});

const parseBody = (init) => {
  return JSON.parse(init.body);
};

const flushMicrotasks = async (count = 5) => {
  for (let index = 0; index < count; index++) {
    await Promise.resolve();
  }
};

const getSetValuesForKey = (key) => {
  return storage.setCalls
    .filter((call) => Object.hasOwn(call, key))
    .map((call) => call[key]);
};

const getRemoveCallCount = (key) => {
  return storage.removeCalls.filter((call) => {
    if (Array.isArray(call)) {
      return call.includes(key);
    }

    return call === key;
  }).length;
};

const createOpenAIEvent = (payload) => {
  const serialized = typeof payload === "string" ? payload : JSON.stringify(payload);
  return `data: ${serialized}\n\n`;
};

const createGeminiCandidate = (parts) => {
  return { candidates: [{ content: { parts } }] };
};

const createGeminiStreamChunks = (items, splitIndex) => {
  const serializedItems = items.map((item) => JSON.stringify(item));

  return [
    `[${serializedItems[0].slice(0, splitIndex)}`,
    serializedItems[0].slice(splitIndex),
    ...serializedItems.slice(1).map((item) => `,${item}`),
    "]"
  ];
};

describe("OpenAI-compatible streaming contract", () => {
  it("S-O-01: concatenates arbitrarily chunked SSE deltas and stores intermediate text", async () => {
    const modelConfigs = [{ modelId: "gpt-test", generationConfig: {} }];
    const apiContents = [{ role: "user", parts: [{ text: "question" }] }];

    const chunks = [
      "da",
      "ta: {\"choices\":[{\"delta\":{\"content\":\"Hel\"},\"finish_reason\":null}]}\n\ne",
      "vent: message\n\ndata: {\"choices\":[{\"delta\":{\"content\":\"lo\"},\"finish_reason\":null}]}\n\n",
      "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n",
      "data: [DONE]\n"
    ];

    mock.enqueue(() => {
      expect(storage.removeCalls).toEqual([STREAM_KEY]);

      return createStreamResponse(200, chunks, {
        "Content-Type": "text/event-stream"
      });
    });

    const result = await streamGenerateContent(
      DUMMY_API_KEY,
      apiContents,
      modelConfigs,
      STREAM_KEY,
      "openai",
      "https://example.com/api/?q=x#section",
      undefined
    );

    expect(mock.calls).toHaveLength(1);
    const { url, init } = mock.calls[0];
    expect(url).toBe("https://example.com/api/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers["Authorization"]).toBe(`Bearer ${DUMMY_API_KEY}`);

    expect(parseBody(init)).toEqual({
      model: "gpt-test",
      messages: [{ role: "user", content: "question" }],
      stream: true
    });

    expect(storage.setCalls).toEqual([
      { [STREAM_KEY]: "Hel" },
      { [STREAM_KEY]: "Hello" }
    ]);

    expect(storage.values[STREAM_KEY]).toBe("Hello");

    expect(result).toEqual({
      ok: true,
      status: 200,
      body: {
        choices: [{ finish_reason: "stop", message: { content: "Hello" } }],
        model: "gpt-test"
      }
    });
  });

  it("S-O-02: ignores DONE, empty, non-data, and malformed lines while keeping valid deltas", async () => {
    const modelConfigs = [{ modelId: "gpt-test", generationConfig: {} }];
    const apiContents = [{ role: "user", parts: [{ text: "question" }] }];

    const chunks = [
      `\n${createOpenAIEvent({ choices: [{ delta: { content: "Hel" }, finish_reason: null }] })}`,
      `event: message\n${createOpenAIEvent("not-json")}${createOpenAIEvent("[DONE]")}`,
      `${createOpenAIEvent({ choices: [{ delta: { content: "lo" }, finish_reason: null }] })}`
        + `${createOpenAIEvent({ choices: [{ delta: {}, finish_reason: "stop" }] })}`
    ];

    mock.enqueueStream(200, chunks, { "Content-Type": "text/event-stream" });

    const result = await streamGenerateContent(
      DUMMY_API_KEY,
      apiContents,
      modelConfigs,
      STREAM_KEY,
      "openai",
      "https://example.com/v1/",
      undefined
    );

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.body.choices[0].message.content).toBe("Hello");
    expect(result.body.choices[0].finish_reason).toBe("stop");
    expect(getSetValuesForKey(STREAM_KEY)).toEqual(["Hel", "Hello"]);
    expect(storage.values[STREAM_KEY]).toBe("Hello");
  });

  it("S-O-03: normalizes an HTTP error without reading the stream body", async () => {
    const modelConfigs = [{ modelId: "gpt-test", generationConfig: {} }];
    const apiContents = [{ role: "user", parts: [{ text: "question" }] }];

    mock.enqueue(() => {
      expect(storage.removeCalls).toEqual([STREAM_KEY]);

      return new Response("Bad Gateway", {
        status: 502,
        headers: { "Content-Type": "text/plain" }
      });
    });

    const result = await streamGenerateContent(
      DUMMY_API_KEY,
      apiContents,
      modelConfigs,
      STREAM_KEY,
      "openai",
      "https://example.com/v1/",
      undefined
    );

    expect(result).toEqual({
      ok: false,
      status: 502,
      body: { error: { message: "Bad Gateway" } }
    });

    expect(storage.setCalls).toEqual([]);
  });
});

describe("Gemini streaming contract", () => {
  it("S-G-01: reconstructs a split JSON array, stores intermediate text, and normalizes the last candidate", async () => {
    const modelConfigs = [{
      modelId: "gemini-test",
      generationConfig: { thinkingConfig: { thinkingLevel: "minimal" } }
    }];

    const apiContents = [{ role: "user", parts: [{ text: "question" }] }];

    const items = [
      createGeminiCandidate([{ text: "Hel" }]),
      createGeminiCandidate([{ text: "lo" }])
    ];

    const firstSerialized = JSON.stringify(items[0]);
    const chunks = createGeminiStreamChunks(items, firstSerialized.indexOf("Hel") + 2);

    mock.enqueue(() => {
      expect(storage.removeCalls).toEqual([STREAM_KEY]);

      return createStreamResponse(200, chunks, {
        "Content-Type": "application/json"
      });
    });

    const result = await streamGenerateContent(
      DUMMY_API_KEY,
      apiContents,
      modelConfigs,
      STREAM_KEY,
      "gemini",
      undefined,
      undefined
    );

    expect(mock.calls).toHaveLength(1);
    const { url, init } = mock.calls[0];
    expect(url).toBe(GEMINI_STREAM_ENDPOINT("gemini-test"));

    const body = parseBody(init);
    expect(body.contents).toEqual(apiContents);
    expect(body.generationConfig).toEqual({ thinkingConfig: { thinkingLevel: "minimal" } });
    expect(Array.isArray(body.safetySettings)).toBe(true);
    expect(getSetValuesForKey(STREAM_KEY)).toEqual(["Hel", "Hello"]);
    expect(storage.values[STREAM_KEY]).toBe("Hello");

    expect(result).toEqual({
      ok: true,
      status: 200,
      body: { candidates: [{ content: { parts: [{ text: "Hello" }] } }] }
    });
  });

  it("S-G-02: keeps thought text out of storage and normalizes the final body into thought plus content parts", async () => {
    const modelConfigs = [{ modelId: "gemini-test", generationConfig: {} }];
    const apiContents = [{ role: "user", parts: [{ text: "question" }] }];

    const items = [
      createGeminiCandidate([{ thought: true, text: "plan " }, { text: "ans" }]),
      createGeminiCandidate([{ thought: true, text: "more " }, { text: "wer" }])
    ];

    const firstSerialized = JSON.stringify(items[0]);
    const chunks = createGeminiStreamChunks(items, firstSerialized.indexOf("ans") + 1);

    mock.enqueueStream(200, chunks, { "Content-Type": "application/json" });

    const result = await streamGenerateContent(
      DUMMY_API_KEY,
      apiContents,
      modelConfigs,
      STREAM_KEY,
      "gemini",
      undefined,
      undefined
    );

    expect(getSetValuesForKey(STREAM_KEY)).toEqual(["ans", "answer"]);
    expect(storage.values[STREAM_KEY]).toBe("answer");

    expect(result).toEqual({
      ok: true,
      status: 200,
      body: {
        candidates: [{
          content: {
            parts: [{ text: "plan more ", thought: true }, { text: "answer" }]
          }
        }]
      }
    });
  });

  it("S-G-03: converts a trailing stream error element into an API error response", async () => {
    const modelConfigs = [
      { modelId: "gemini-first", generationConfig: {} },
      { modelId: "gemini-second", generationConfig: {} }
    ];

    const apiContents = [{ role: "user", parts: [{ text: "question" }] }];

    const items = [
      createGeminiCandidate([{ text: "Hel" }]),
      { error: { code: 503, message: "temporary stream failure" } }
    ];

    const firstSerialized = JSON.stringify(items[0]);
    const chunks = createGeminiStreamChunks(items, firstSerialized.indexOf("Hel") + 2);

    mock.enqueueStream(200, chunks, { "Content-Type": "application/json" });
    mock.enqueueStream(200, chunks, { "Content-Type": "application/json" });

    const result = await streamGenerateContent(
      DUMMY_API_KEY,
      apiContents,
      modelConfigs,
      STREAM_KEY,
      "gemini",
      undefined,
      undefined
    );

    expect(result).toEqual({
      ok: false,
      status: 503,
      body: { error: { message: "temporary stream failure" } }
    });

    expect(storage.values[STREAM_KEY]).toBe("Hel");
  });

  it("S-G-04: returns the first element from a non-2xx JSON array body", async () => {
    const modelConfigs = [{ modelId: "gemini-test", generationConfig: {} }];
    const apiContents = [{ role: "user", parts: [{ text: "question" }] }];

    mock.enqueueJson(500, [
      { error: { message: "first error" } },
      { error: { message: "second error" } }
    ]);

    const result = await streamGenerateContent(
      DUMMY_API_KEY,
      apiContents,
      modelConfigs,
      STREAM_KEY,
      "gemini",
      undefined,
      undefined
    );

    expect(result).toEqual({
      ok: false,
      status: 500,
      body: { error: { message: "first error" } }
    });

    expect(storage.setCalls).toEqual([]);
  });
});

describe("Gemini streaming retry and fallback contract", () => {
  it("R-03: retries a single-model 503 stream after 5 seconds and then returns the streamed content", async () => {
    vi.useFakeTimers();

    const modelConfigs = [{ modelId: "gemini-test", generationConfig: {} }];
    const apiContents = [{ role: "user", parts: [{ text: "question" }] }];
    const successItems = [createGeminiCandidate([{ text: "Hello" }])];
    const successChunks = createGeminiStreamChunks(successItems, JSON.stringify(successItems[0]).indexOf("Hello") + 2);

    mock.enqueueJson(503, { error: { message: "temporary failure" } });
    mock.enqueueStream(200, successChunks, { "Content-Type": "application/json" });

    const pending = streamGenerateContent(
      DUMMY_API_KEY,
      apiContents,
      modelConfigs,
      STREAM_KEY,
      "gemini",
      undefined,
      RETRY_KEY
    );

    await flushMicrotasks();

    expect(mock.calls).toHaveLength(1);

    expect(getSetValuesForKey(RETRY_KEY)).toContainEqual({
      phase: "retrying",
      status: 503,
      attempt: 1,
      maxAttempts: 2,
      delayMs: 5000
    });

    await vi.advanceTimersByTimeAsync(5000);
    await flushMicrotasks();

    const result = await pending;

    expect(mock.calls).toHaveLength(2);

    expect(result).toEqual({
      ok: true,
      status: 200,
      body: { candidates: [{ content: { parts: [{ text: "Hello" }] } }] }
    });

    expect(storage.values[STREAM_KEY]).toBe("Hello");
    expect(storage.values).not.toHaveProperty(RETRY_KEY);
  });

  it("F-S-01: immediately falls back on a streaming 429 and stops after the next model succeeds", async () => {
    const modelConfigs = [
      { modelId: "gemini-first", generationConfig: {} },
      { modelId: "gemini-second", generationConfig: {} },
      { modelId: "gemini-unused", generationConfig: {} }
    ];

    const apiContents = [{ role: "user", parts: [{ text: "question" }] }];

    const successItems = [
      createGeminiCandidate([{ text: "Hel" }]),
      createGeminiCandidate([{ text: "lo" }])
    ];

    const successChunks = createGeminiStreamChunks(successItems, JSON.stringify(successItems[0]).indexOf("Hel") + 2);

    mock.enqueueJson(429, { error: { message: "quota exceeded" } });
    mock.enqueueStream(200, successChunks, { "Content-Type": "application/json" });

    const result = await streamGenerateContent(
      DUMMY_API_KEY,
      apiContents,
      modelConfigs,
      STREAM_KEY,
      "gemini",
      undefined,
      RETRY_KEY
    );

    expect(mock.calls).toHaveLength(2);
    expect(mock.calls[0].url).toBe(GEMINI_STREAM_ENDPOINT("gemini-first"));
    expect(mock.calls[1].url).toBe(GEMINI_STREAM_ENDPOINT("gemini-second"));
    expect(getSetValuesForKey(RETRY_KEY)).toContainEqual({ phase: "fallback", status: 429 });
    expect(storage.values[STREAM_KEY]).toBe("Hello");
    expect(getRemoveCallCount(STREAM_KEY)).toBe(2);
    expect(storage.values).not.toHaveProperty(RETRY_KEY);

    expect(result).toEqual({
      ok: true,
      status: 200,
      body: { candidates: [{ content: { parts: [{ text: "Hello" }] } }] }
    });
  });

  it("F-S-02: immediately falls back on a streaming 503 and does not try a third model after success", async () => {
    const modelConfigs = [
      { modelId: "gemini-first", generationConfig: {} },
      { modelId: "gemini-second", generationConfig: {} },
      { modelId: "gemini-unused", generationConfig: {} }
    ];

    const apiContents = [{ role: "user", parts: [{ text: "question" }] }];

    const successItems = [
      createGeminiCandidate([{ text: "Hel" }]),
      createGeminiCandidate([{ text: "lo" }])
    ];

    const successChunks = createGeminiStreamChunks(successItems, JSON.stringify(successItems[0]).indexOf("Hel") + 2);

    mock.enqueueJson(503, { error: { message: "temporary failure" } });
    mock.enqueueStream(200, successChunks, { "Content-Type": "application/json" });

    const result = await streamGenerateContent(
      DUMMY_API_KEY,
      apiContents,
      modelConfigs,
      STREAM_KEY,
      "gemini",
      undefined,
      RETRY_KEY
    );

    expect(mock.calls).toHaveLength(2);
    expect(mock.calls[0].url).toBe(GEMINI_STREAM_ENDPOINT("gemini-first"));
    expect(mock.calls[1].url).toBe(GEMINI_STREAM_ENDPOINT("gemini-second"));
    expect(getSetValuesForKey(RETRY_KEY)).toContainEqual({ phase: "fallback", status: 503 });
    expect(getRemoveCallCount(STREAM_KEY)).toBe(2);
    expect(storage.values[STREAM_KEY]).toBe("Hello");
    expect(storage.values).not.toHaveProperty(RETRY_KEY);

    expect(result).toEqual({
      ok: true,
      status: 200,
      body: { candidates: [{ content: { parts: [{ text: "Hello" }] } }] }
    });
  });
});