import { vi } from "vitest";

// ── Response builders ─────────────────────────────────────────────────────

// Build a JSON HTTP response. The body is stringified and the standard
// `Content-Type: application/json` header is attached unless overridden.
export const createJsonResponse = (status, body, headers = {}) => {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });
};

// Build a plain text HTTP response. The body is kept as-is so `response.text()`
// returns the original string, matching how non-JSON error bodies are read.
export const createTextResponse = (status, text, headers = {}) => {
  return new Response(text, {
    status,
    headers: { "Content-Type": "text/plain", ...headers }
  });
};

// Build a TypeError that, when dequeued, makes `fetch` reject. This mirrors the
// shape of a real network failure (`fetch` rejects with a TypeError).
export const createNetworkError = (message = "network unavailable") => {
  return new TypeError(message);
};

// ── fetch mock installer ──────────────────────────────────────────────────

// Replace `globalThis.fetch` with a queue-backed mock. Each call dequeues the
// next queued response (Response, Error, or resolver function) and records the
// request URL and RequestInit for later assertion.
export const installFetchMock = () => {
  const queue = [];
  const calls = [];

  const fetchMock = vi.fn(async (input, init) => {
    const url = typeof input === "string" ? input : input?.url;
    calls.push({ url, init });

    if (queue.length === 0) {
      throw new Error("fetch-mock: no queued response. Enqueue one before calling generateContent().");
    }

    const next = queue.shift();

    if (next instanceof Error) {
      throw next;
    }

    if (typeof next === "function") {
      return next(input, init);
    }

    return next;
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchMock;

  return {
    fetchMock,
    calls,
    enqueue: (response) => {
      queue.push(response);
    },
    enqueueJson: (status, body, headers) => {
      queue.push(createJsonResponse(status, body, headers));
    },
    enqueueText: (status, text, headers) => {
      queue.push(createTextResponse(status, text, headers));
    },
    enqueueNetworkError: (message) => {
      queue.push(createNetworkError(message));
    },
    restore: () => {
      globalThis.fetch = originalFetch;
    }
  };
};