import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { generateContent } from "../../extension/utils.js";
import { installFetchMock } from "../helpers/fetch-mock.js";

// Phase 2 contract tests for the non-streaming `generateContent()` entry point.
// These tests fix the HTTP contract observed through the public API only; they
// do not import or exercise internal helpers directly.

const DUMMY_API_KEY = "test-api-key";

const GEMINI_ENDPOINT = (modelId) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;

let mock;

beforeEach(() => {
  mock = installFetchMock();
});

afterEach(() => {
  mock.restore();
});

// Helper: parse the request body sent to fetch as an object.
const parseBody = (init) => {
  return JSON.parse(init.body);
};

// ── Gemini: request contract ─────────────────────────────────────────────

describe("Gemini request contract", () => {
  it("G-01: posts to the generateContent endpoint with the expected header and contents", async () => {
    const modelConfigs = [{ modelId: "gemini-test-model", generationConfig: {} }];
    const apiContents = [{ role: "user", parts: [{ text: "test prompt" }] }];
    mock.enqueueJson(200, { candidates: [{ content: { parts: [{ text: "ok" }] } }] });

    const result = await generateContent(
      DUMMY_API_KEY,
      apiContents,
      modelConfigs,
      "gemini",
      undefined,
      undefined
    );

    expect(mock.calls).toHaveLength(1);
    const { url, init } = mock.calls[0];
    expect(url).toBe(GEMINI_ENDPOINT("gemini-test-model"));
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers["x-goog-api-key"]).toBe(DUMMY_API_KEY);

    const body = parseBody(init);
    expect(body.contents).toEqual(apiContents);
    expect(body).not.toHaveProperty("systemInstruction");
    expect(body.generationConfig).toEqual({});
    expect(Array.isArray(body.safetySettings)).toBe(true);
    expect(body.safetySettings.length).toBeGreaterThan(0);

    expect(result).toEqual({
      ok: true,
      status: 200,
      body: { candidates: [{ content: { parts: [{ text: "ok" }] } }] }
    });
  });

  it("G-02: separates system role into systemInstruction and preserves the remaining order", async () => {
    const modelConfigs = [{ modelId: "gemini-test-model", generationConfig: {} }];

    const apiContents = [
      { role: "system", parts: [{ text: "system rule A" }] },
      { role: "user", parts: [{ text: "first user" }] },
      { role: "model", parts: [{ text: "first model" }] },
      { role: "system", parts: [{ text: "system rule B" }] },
      { role: "user", parts: [{ text: "second user" }] }
    ];

    const apiContentsSnapshot = JSON.parse(JSON.stringify(apiContents));
    mock.enqueueJson(200, { candidates: [{ content: { parts: [{ text: "ok" }] } }] });

    await generateContent(DUMMY_API_KEY, apiContents, modelConfigs, "gemini", undefined, undefined);

    expect(apiContents).toEqual(apiContentsSnapshot);

    const body = parseBody(mock.calls[0].init);

    expect(body.systemInstruction).toEqual({
      parts: [{ text: "system rule A" }, { text: "system rule B" }]
    });

    expect(body.contents).toEqual([
      { role: "user", parts: [{ text: "first user" }] },
      { role: "model", parts: [{ text: "first model" }] },
      { role: "user", parts: [{ text: "second user" }] }
    ]);

    expect(body.contents.some((item) => item.role === "system")).toBe(false);
  });

  it("G-03: keeps inline_data untouched inside a user part alongside text", async () => {
    const modelConfigs = [{ modelId: "gemini-test-model", generationConfig: {} }];
    const inlineData = { mime_type: "image/png", data: "QUJDRA==" };

    const apiContents = [
      { role: "system", parts: [{ text: "describe the image" }] },
      { role: "user", parts: [{ text: "what is this?" }, { inline_data: inlineData }] }
    ];

    mock.enqueueJson(200, { candidates: [{ content: { parts: [{ text: "ok" }] } }] });

    await generateContent(DUMMY_API_KEY, apiContents, modelConfigs, "gemini", undefined, undefined);

    const body = parseBody(mock.calls[0].init);
    expect(body.systemInstruction).toEqual({ parts: [{ text: "describe the image" }] });

    expect(body.contents).toEqual([
      { role: "user", parts: [{ text: "what is this?" }, { inline_data: inlineData }] }
    ]);

    expect(body.contents[0].parts[1].inline_data).toEqual(inlineData);
  });

  it("G-04a: forwards a thinking level inside generationConfig.thinkingConfig", async () => {
    const modelConfigs = [{
      modelId: "gemini-test-model",
      generationConfig: { thinkingConfig: { thinkingLevel: "minimal" } }
    }];

    const apiContents = [{ role: "user", parts: [{ text: "hi" }] }];
    mock.enqueueJson(200, { candidates: [{ content: { parts: [{ text: "ok" }] } }] });

    await generateContent(DUMMY_API_KEY, apiContents, modelConfigs, "gemini", undefined, undefined);

    const body = parseBody(mock.calls[0].init);
    expect(body.generationConfig).toEqual({ thinkingConfig: { thinkingLevel: "minimal" } });
  });

  it("G-04b: forwards a numeric thinking budget inside generationConfig.thinkingConfig", async () => {
    const modelConfigs = [{
      modelId: "gemini-test-model",
      generationConfig: { thinkingConfig: { thinkingBudget: 0 } }
    }];

    const apiContents = [{ role: "user", parts: [{ text: "hi" }] }];
    mock.enqueueJson(200, { candidates: [{ content: { parts: [{ text: "ok" }] } }] });

    await generateContent(DUMMY_API_KEY, apiContents, modelConfigs, "gemini", undefined, undefined);

    const body = parseBody(mock.calls[0].init);
    expect(body.generationConfig).toEqual({ thinkingConfig: { thinkingBudget: 0 } });
  });
});

// ── Gemini: response / error contract ─────────────────────────────────────

describe("Gemini response and error contract", () => {
  it("G-05: returns a non-retryable JSON HTTP error without retrying", async () => {
    const modelConfigs = [{ modelId: "gemini-test-model", generationConfig: {} }];
    const apiContents = [{ role: "user", parts: [{ text: "hi" }] }];
    mock.enqueueJson(400, { error: { message: "Bad request from Gemini" } });

    const result = await generateContent(DUMMY_API_KEY, apiContents, modelConfigs, "gemini", undefined, undefined);

    expect(mock.calls).toHaveLength(1);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.body.error.message).toBe("Bad request from Gemini");
  });

  it("G-05b: returns a single-model 429 immediately without retry", async () => {
    const modelConfigs = [{ modelId: "gemini-test-model", generationConfig: {} }];
    const apiContents = [{ role: "user", parts: [{ text: "hi" }] }];
    mock.enqueueJson(429, { error: { message: "Quota exceeded" } });

    const result = await generateContent(DUMMY_API_KEY, apiContents, modelConfigs, "gemini", undefined, undefined);

    expect(mock.calls).toHaveLength(1);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(429);
    expect(result.body.error.message).toBe("Quota exceeded");
  });

  it("G-06: normalizes a non-JSON HTTP error body into an error.message envelope", async () => {
    const modelConfigs = [{ modelId: "gemini-test-model", generationConfig: {} }];
    const apiContents = [{ role: "user", parts: [{ text: "hi" }] }];
    mock.enqueueText(500, "Internal Server Error");

    const result = await generateContent(DUMMY_API_KEY, apiContents, modelConfigs, "gemini", undefined, undefined);

    expect(mock.calls).toHaveLength(1);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: { message: "Internal Server Error" } });
  });

  it("G-07: returns status 1000 on a network error without leaking the request", async () => {
    const modelConfigs = [{ modelId: "gemini-test-model", generationConfig: {} }];
    const apiContents = [{ role: "user", parts: [{ text: "hi" }] }];
    mock.enqueueNetworkError("network unavailable");

    const result = await generateContent(DUMMY_API_KEY, apiContents, modelConfigs, "gemini", undefined, undefined);

    expect(mock.calls).toHaveLength(1);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(1000);
    expect(result.body.error.message).toBeTruthy();
    expect(result.body.error.message).not.toContain(DUMMY_API_KEY);
    expect(result.body.error.message).not.toContain("x-goog-api-key");
    expect(result.body).not.toHaveProperty("stack");
    expect(result.body).not.toHaveProperty("headers");
  });
});

// ── OpenAI-compatible: request contract ───────────────────────────────────

describe("OpenAI-compatible request contract", () => {
  it("O-01: normalizes the Base URL and posts to /chat/completions", async () => {
    const modelConfigs = [{ modelId: "gpt-test", generationConfig: {} }];
    const apiContents = [{ role: "user", parts: [{ text: "hi" }] }];
    mock.enqueueJson(200, { choices: [{ message: { content: "ok" }, finish_reason: "stop" }] });

    await generateContent(
      DUMMY_API_KEY,
      apiContents,
      modelConfigs,
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
  });

  it("O-02: converts Gemini-style roles and joins text parts without a separator", async () => {
    const modelConfigs = [{ modelId: "gpt-test", generationConfig: {} }];

    const apiContents = [
      { role: "system", parts: [{ text: "you are helpful" }] },
      { role: "user", parts: [{ text: "hello " }, { text: "world" }] },
      { role: "model", parts: [{ text: "hi there" }] }
    ];

    mock.enqueueJson(200, { choices: [{ message: { content: "ok" }, finish_reason: "stop" }] });

    await generateContent(DUMMY_API_KEY, apiContents, modelConfigs, "openai", "https://example.com/v1/", undefined);

    const body = parseBody(mock.calls[0].init);
    expect(body.model).toBe("gpt-test");

    expect(body.messages).toEqual([
      { role: "system", content: "you are helpful" },
      { role: "user", content: "hello world" },
      { role: "assistant", content: "hi there" }
    ]);
  });

  it("O-03: converts multimodal user parts into OpenAI content-part array preserving order", async () => {
    const modelConfigs = [{ modelId: "gpt-test", generationConfig: {} }];
    const inlineData = { mime_type: "image/png", data: "QUJDRA==" };

    const apiContents = [
      { role: "user", parts: [{ text: "what is this?" }, { inline_data: inlineData }] }
    ];

    mock.enqueueJson(200, { choices: [{ message: { content: "ok" }, finish_reason: "stop" }] });

    await generateContent(DUMMY_API_KEY, apiContents, modelConfigs, "openai", "https://example.com/v1/", undefined);

    const body = parseBody(mock.calls[0].init);

    expect(body.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "what is this?" },
          {
            type: "image_url",
            image_url: { url: "data:image/png;base64,QUJDRA==" }
          }
        ]
      }
    ]);
  });

  it("O-04a: sends reasoning_effort and thinking when configured", async () => {
    const modelConfigs = [{
      modelId: "gpt-test",
      generationConfig: { reasoningEffort: "low", thinkingType: "enabled" }
    }];

    const apiContents = [{ role: "user", parts: [{ text: "hi" }] }];
    mock.enqueueJson(200, { choices: [{ message: { content: "ok" }, finish_reason: "stop" }] });

    await generateContent(DUMMY_API_KEY, apiContents, modelConfigs, "openai", "https://example.com/v1/", undefined);

    const body = parseBody(mock.calls[0].init);
    expect(body.reasoning_effort).toBe("low");
    expect(body.thinking).toEqual({ type: "enabled" });
  });

  it("O-04b: omits reasoning_effort and thinking when both are empty", async () => {
    const modelConfigs = [{
      modelId: "gpt-test",
      generationConfig: { reasoningEffort: "", thinkingType: "" }
    }];

    const apiContents = [{ role: "user", parts: [{ text: "hi" }] }];
    mock.enqueueJson(200, { choices: [{ message: { content: "ok" }, finish_reason: "stop" }] });

    await generateContent(DUMMY_API_KEY, apiContents, modelConfigs, "openai", "https://example.com/v1/", undefined);

    const body = parseBody(mock.calls[0].init);
    expect(body).not.toHaveProperty("reasoning_effort");
    expect(body).not.toHaveProperty("thinking");
  });
});

// ── OpenAI-compatible: response / error contract ──────────────────────────

describe("OpenAI-compatible response and error contract", () => {
  it("O-05: normalizes a successful chat completion response", async () => {
    const modelConfigs = [{ modelId: "gpt-test", generationConfig: {} }];
    const apiContents = [{ role: "user", parts: [{ text: "hi" }] }];
    const body = { choices: [{ message: { content: "ok" }, finish_reason: "stop" }] };
    mock.enqueueJson(200, body);

    const result = await generateContent(DUMMY_API_KEY, apiContents, modelConfigs, "openai", "https://example.com/v1/", undefined);

    expect(result).toEqual({ ok: true, status: 200, body });
  });

  it("O-06: normalizes a non-JSON HTTP error body into an error.message envelope", async () => {
    const modelConfigs = [{ modelId: "gpt-test", generationConfig: {} }];
    const apiContents = [{ role: "user", parts: [{ text: "hi" }] }];
    mock.enqueueText(502, "Bad Gateway");

    const result = await generateContent(DUMMY_API_KEY, apiContents, modelConfigs, "openai", "https://example.com/v1/", undefined);

    expect(result.ok).toBe(false);
    expect(result.status).toBe(502);
    expect(result.body).toEqual({ error: { message: "Bad Gateway" } });
  });

  it("O-07a: returns status 1002 without calling fetch when the Base URL is empty", async () => {
    const modelConfigs = [{ modelId: "gpt-test", generationConfig: {} }];
    const apiContents = [{ role: "user", parts: [{ text: "hi" }] }];

    const result = await generateContent(DUMMY_API_KEY, apiContents, modelConfigs, "openai", "", undefined);

    expect(mock.calls).toHaveLength(0);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(1002);
    expect(result.body.error.message).toContain("OpenAI-compatible Base URL is not set.");
  });

  it("O-07b: returns status 1003 without calling fetch when the Base URL is invalid", async () => {
    const modelConfigs = [{ modelId: "gpt-test", generationConfig: {} }];
    const apiContents = [{ role: "user", parts: [{ text: "hi" }] }];

    const result = await generateContent(DUMMY_API_KEY, apiContents, modelConfigs, "openai", "not a URL", undefined);

    expect(mock.calls).toHaveLength(0);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(1003);
    expect(result.body.error.message).toContain("OpenAI-compatible Base URL is invalid.");
  });

  it("O-08: returns status 1000 on a network error", async () => {
    const modelConfigs = [{ modelId: "gpt-test", generationConfig: {} }];
    const apiContents = [{ role: "user", parts: [{ text: "hi" }] }];
    mock.enqueueNetworkError("network unavailable");

    const result = await generateContent(DUMMY_API_KEY, apiContents, modelConfigs, "openai", "https://example.com/v1/", undefined);

    expect(mock.calls).toHaveLength(1);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(1000);
    expect(result.body.error.message).toBeTruthy();
    expect(result.body.error.message).not.toContain(DUMMY_API_KEY);
    expect(result.body.error.message).not.toContain("Authorization");
  });
});