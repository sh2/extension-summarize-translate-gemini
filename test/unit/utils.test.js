import { describe, it, expect } from "vitest";
import { normalizeBaseUrl, getModelConfigs, getResponseContent } from "../../extension/utils.js";

// Minimal chrome.i18n stub for functions that call chrome.i18n.getMessage().
// Returns a deterministic "message:<key>" string so assertions stay stable
// without duplicating real translation fixtures.
globalThis.chrome = {
  i18n: {
    getMessage: (key) => `message:${key}`
  }
};

describe("normalizeBaseUrl", () => {
  it("trims whitespace and drops the trailing slash from the origin", () => {
    expect(normalizeBaseUrl(" https://example.com/ ")).toBe("https://example.com");
  });

  it("keeps the path after removing the trailing slash", () => {
    expect(normalizeBaseUrl("https://example.com/api/v1/")).toBe("https://example.com/api/v1");
  });

  it("strips query and hash while keeping the path", () => {
    expect(normalizeBaseUrl("https://example.com/api/?q=x#section")).toBe("https://example.com/api");
  });

  it("preserves the http protocol and port", () => {
    expect(normalizeBaseUrl("http://localhost:8080/v1/")).toBe("http://localhost:8080/v1");
  });

  it("collapses a root path made of slashes to the origin", () => {
    expect(normalizeBaseUrl("https://example.com////")).toBe("https://example.com");
  });

  it("throws a TypeError for an invalid URL", () => {
    expect(() => normalizeBaseUrl("not a URL")).toThrow(TypeError);
  });
});

describe("getModelConfigs", () => {
  it("maps a Gemini model with a thinking level", () => {
    const [config] = getModelConfigs("3.5-flash:minimal");

    expect(config.modelId).toBe("gemini-3.5-flash");
    expect(config.generationConfig.thinkingConfig.thinkingLevel).toBe("minimal");
  });

  it("maps a Gemini model with a numeric thinking budget of 0", () => {
    const [config] = getModelConfigs("3.1-flash-lite:0");

    expect(config.modelId).toBe("gemini-3.1-flash-lite");
    expect(config.generationConfig.thinkingConfig.thinkingBudget).toBe(0);
  });

  it("maps a Gemini model with a negative thinking budget", () => {
    const [config] = getModelConfigs("3.1-flash-lite:-1");

    expect(config.modelId).toBe("gemini-3.1-flash-lite");
    expect(config.generationConfig.thinkingConfig.thinkingBudget).toBe(-1);
  });

  it("preserves the input order for multiple Gemini models", () => {
    const configs = getModelConfigs("3.5-flash:minimal/3.1-flash-lite:0");

    expect(configs).toHaveLength(2);
    expect(configs[0].modelId).toBe("gemini-3.5-flash");
    expect(configs[1].modelId).toBe("gemini-3.1-flash-lite");
  });

  it("resolves the zz placeholder to the user-specified model id with a thinking level", () => {
    const [config] = getModelConfigs("zz", "my-custom-model:high");

    expect(config.modelId).toBe("my-custom-model");
    expect(config.generationConfig.thinkingConfig.thinkingLevel).toBe("high");
  });

  it("builds a single OpenAI config from the user model and extra config", () => {
    const [config] = getModelConfigs("anything", "gpt-test", "openai", { reasoningEffort: "low", thinkingType: "enabled" });

    expect(config.modelId).toBe("gpt-test");
    expect(config.generationConfig.reasoningEffort).toBe("low");
    expect(config.generationConfig.thinkingType).toBe("enabled");
  });
});

describe("getResponseContent", () => {
  describe("Gemini", () => {
    it("returns the text from the first content part", () => {
      const response = { ok: true, body: { candidates: [{ content: { parts: [{ text: "hello" }] } }] } };

      expect(getResponseContent(response)).toBe("hello");
    });

    it("skips a leading thought part and returns the following text part", () => {
      const response = {
        ok: true,
        body: {
          candidates: [{
            content: { parts: [{ thought: true, text: "thinking" }, { text: "answer" }] }
          }]
        }
      };

      expect(getResponseContent(response)).toBe("answer");
    });

    it("reports a prompt block with the block reason", () => {
      const response = { ok: true, body: { promptFeedback: { blockReason: "SAFETY" } } };

      expect(getResponseContent(response)).toBe("message:response_prompt_blocked Reason: SAFETY");
    });

    it("reports a response block with the finish reason", () => {
      const response = { ok: true, body: { candidates: [{ finishReason: "SAFETY" }] } };

      expect(getResponseContent(response)).toBe("message:response_response_blocked Reason: SAFETY");
    });

    it("returns the unexpected-response message when no candidate content exists", () => {
      const response = { ok: true, body: {} };

      expect(getResponseContent(response)).toBe("message:response_unexpected_response");
    });

    it("surfaces the HTTP status, error message, and no-apikey hint without an API key", () => {
      const response = { ok: false, status: 500, body: { error: { message: "internal error" } } };

      expect(getResponseContent(response, false)).toBe("Error: 500\n\ninternal error\n\nmessage:response_no_apikey");
    });
  });

  describe("OpenAI", () => {
    it("returns the message content for a normal stop response", () => {
      const response = { ok: true, body: { choices: [{ message: { content: "hi" }, finish_reason: "stop" }] } };

      expect(getResponseContent(response, true, "openai")).toBe("hi");
    });

    it("reports a blocked response using the finish reason", () => {
      const response = { ok: true, body: { choices: [{ message: { content: "hi" }, finish_reason: "length" }] } };

      expect(getResponseContent(response, true, "openai")).toBe("message:response_response_blocked Reason: length");
    });

    it("returns the unexpected-response message when no choice content exists", () => {
      const response = { ok: true, body: {} };

      expect(getResponseContent(response, true, "openai")).toBe("message:response_unexpected_response");
    });

    it("surfaces the base-url and no-apikey hints on status 1002 without an API key", () => {
      const response = {
        ok: false,
        status: 1002,
        body: { error: { message: "OpenAI-compatible Base URL is not set." } }
      };

      expect(getResponseContent(response, false, "openai")).toBe(
        "Error: 1002\n\nOpenAI-compatible Base URL is not set.\n\nmessage:response_no_base_url\n\nmessage:response_no_apikey_openai"
      );
    });
  });
});