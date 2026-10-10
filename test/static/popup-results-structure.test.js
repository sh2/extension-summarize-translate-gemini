import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDirectory, "..", "..");
const popupHtmlPath = resolve(repoRoot, "extension", "popup.html");
const popupJsPath = resolve(repoRoot, "extension", "popup.js");
const resultsHtmlPath = resolve(repoRoot, "extension", "results.html");
const resultsJsPath = resolve(repoRoot, "extension", "results.js");

const parseHtmlDocument = async (absolutePath) => {
  const html = await readFile(absolutePath, "utf8");
  const dom = new JSDOM(html);

  return {
    document: dom.window.document,
    close() {
      dom.window.close();
    }
  };
};

describe("popup and results structure", () => {
  it("keeps popup status elements accessible without inline gray styles", async () => {
    const popupDom = await parseHtmlDocument(popupHtmlPath);
    const popupDocument = popupDom.document;

    try {
      const statusElement = popupDocument.getElementById("status");
      const statusLiveElement = popupDocument.getElementById("status-live");
      const operationStatusElement = popupDocument.getElementById("operation-status");

      expect(statusElement?.classList.contains("status-text")).toBe(true);
      expect(statusElement?.hasAttribute("style")).toBe(false);
      expect(statusElement?.hasAttribute("role")).toBe(false);

      expect(statusLiveElement?.classList.contains("visually-hidden")).toBe(true);
      expect(statusLiveElement?.getAttribute("role")).toBe("status");

      expect(operationStatusElement?.classList.contains("status-text")).toBe(true);
      expect(operationStatusElement?.getAttribute("role")).toBe("status");
      expect(operationStatusElement?.hasAttribute("style")).toBe(false);

      expect(popupDocument.querySelector('[style="color: gray;"]')).toBeNull();
    } finally {
      popupDom.close();
    }
  });

  it("keeps results status elements accessible without inline gray styles", async () => {
    const resultsDom = await parseHtmlDocument(resultsHtmlPath);
    const resultsDocument = resultsDom.document;

    try {
      const sendStatusElement = resultsDocument.getElementById("send-status");
      const sendStatusLiveElement = resultsDocument.getElementById("send-status-live");
      const operationStatusElement = resultsDocument.getElementById("operation-status");

      expect(sendStatusElement?.classList.contains("status-text")).toBe(true);
      expect(sendStatusElement?.hasAttribute("style")).toBe(false);
      expect(sendStatusElement?.hasAttribute("role")).toBe(false);

      expect(sendStatusLiveElement?.classList.contains("visually-hidden")).toBe(true);
      expect(sendStatusLiveElement?.getAttribute("role")).toBe("status");

      expect(operationStatusElement?.classList.contains("status-text")).toBe(true);
      expect(operationStatusElement?.getAttribute("role")).toBe("status");
      expect(operationStatusElement?.hasAttribute("style")).toBe(false);

      expect(resultsDocument.querySelector('[style="color: gray;"]')).toBeNull();
    } finally {
      resultsDom.close();
    }
  });

  it("keeps the conversation question styling in the stylesheet, not inline", async () => {
    const resultsSource = await readFile(resultsJsPath, "utf8");
    const resultsDom = await parseHtmlDocument(resultsHtmlPath);
    const resultsDocument = resultsDom.document;

    try {
      const styleText = Array.from(resultsDocument.querySelectorAll("style"))
        .map((element) => element.textContent)
        .join("\n");

      expect(styleText).toContain(".conversation-question");
      expect(resultsSource).toContain("conversation-question");

      // The conversation DOM is copied to the clipboard as-is, so presentation set
      // through element.style would ride along into the pasted HTML, where the
      // extension stylesheet does not exist.
      // See docs/RESEARCH_WORD_HTML_PASTE.md.
      expect(resultsSource).not.toMatch(/\.style\.(backgroundColor|borderRadius|margin|padding)\s*=/);
    } finally {
      resultsDom.close();
    }
  });

  it("clears the OpenCode session key when reusing a result slot", async () => {
    const popupSource = await readFile(popupJsPath, "utf8");

    const slotCleanup = popupSource.match(
      /resultIndex = \(resultIndex \+ 1\) % 20;[\s\S]*?opencodeSession_\$\{resultIndex\}`\);/
    );

    expect(slotCleanup).not.toBeNull();
    expect(slotCleanup[0]).toContain("result_${resultIndex}");
    expect(slotCleanup[0]).toContain("conversation_${resultIndex}");
    expect(slotCleanup[0]).toContain("retryStatus_${resultIndex}");
  });

  it("keeps the OpenCode session key when clearing the conversation", async () => {
    const resultsSource = await readFile(resultsJsPath, "utf8");
    const clearConversation = resultsSource.match(/const clearConversation = async \(\) => \{[\s\S]*?\n\};/);

    expect(clearConversation).not.toBeNull();
    expect(clearConversation[0]).toContain("conversation_${resultIndex}");
    expect(clearConversation[0]).not.toContain("opencodeSession_");
  });
});