import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createOpenCodeSessionId,
  isOpenCodeGoUrl,
  getOrCreateOpenCodeSessionId
} from "../../extension/utils.js";
import { installChromeStorageSessionMock } from "../helpers/chrome-storage-mock.js";

// Unit tests for the OpenCode Go session ID helpers introduced for
// https://github.com/sh2/extension-summarize-translate-gemini/issues/51.

const SESSION_ID_PATTERN = /^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/;

let storage;
let consoleErrorSpy;

beforeEach(() => {
  storage = installChromeStorageSessionMock();
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
  storage.restore();
});

describe("createOpenCodeSessionId", () => {
  it("returns an ses_-prefixed ID in the official client's shape", () => {
    expect(createOpenCodeSessionId()).toMatch(SESSION_ID_PATTERN);
  });

  it("returns a different ID on each call", () => {
    expect(createOpenCodeSessionId()).not.toBe(createOpenCodeSessionId());
  });
});

describe("isOpenCodeGoUrl", () => {
  it("accepts the OpenCode Go base URL and its origin", () => {
    expect(isOpenCodeGoUrl("https://opencode.ai/zen/go/v1")).toBe(true);
    expect(isOpenCodeGoUrl("https://opencode.ai/zen/go/v1/")).toBe(true);
    expect(isOpenCodeGoUrl("https://opencode.ai")).toBe(true);
  });

  it("rejects non-HTTPS, subdomains, other hosts, and invalid input", () => {
    expect(isOpenCodeGoUrl("http://opencode.ai/zen/go/v1")).toBe(false);
    expect(isOpenCodeGoUrl("https://api.opencode.ai/v1")).toBe(false);
    expect(isOpenCodeGoUrl("https://opencode.ai.evil.example/v1")).toBe(false);
    expect(isOpenCodeGoUrl("https://example.com/v1")).toBe(false);
    expect(isOpenCodeGoUrl("")).toBe(false);
    expect(isOpenCodeGoUrl("not a URL")).toBe(false);
  });
});

describe("getOrCreateOpenCodeSessionId", () => {
  it("creates and stores a new ID when none is stored", async () => {
    const sessionId = await getOrCreateOpenCodeSessionId(3);

    expect(sessionId).toMatch(SESSION_ID_PATTERN);
    expect(storage.values["opencodeSession_3"]).toBe(sessionId);
    expect(storage.setCalls).toEqual([{ opencodeSession_3: sessionId }]);
  });

  it("reuses a stored ID without overwriting it", async () => {
    storage.values["opencodeSession_0"] = "ses_stored000000abcdefghijklmn";

    const sessionId = await getOrCreateOpenCodeSessionId(0);

    expect(sessionId).toBe("ses_stored000000abcdefghijklmn");
    expect(storage.setCalls).toEqual([]);
  });

  it("creates a new ID after the stored one is removed", async () => {
    const first = await getOrCreateOpenCodeSessionId(1);
    await chrome.storage.session.remove("opencodeSession_1");
    const second = await getOrCreateOpenCodeSessionId(1);

    expect(second).toMatch(SESSION_ID_PATTERN);
    expect(second).not.toBe(first);
  });

  it("still returns an ID when reading from storage fails", async () => {
    chrome.storage.session.get = async () => {
      throw new Error("read failed");
    };

    const sessionId = await getOrCreateOpenCodeSessionId(2);

    expect(sessionId).toMatch(SESSION_ID_PATTERN);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("still returns an ID when writing to storage fails", async () => {
    chrome.storage.session.set = async () => {
      throw new Error("write failed");
    };

    const sessionId = await getOrCreateOpenCodeSessionId(4);

    expect(sessionId).toMatch(SESSION_ID_PATTERN);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
