import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { afterAll, describe, expect, it } from "vitest";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDirectory, "..", "..");
const popupSourcePath = resolve(repoRoot, "extension", "popup.js");
const readabilitySourcePath = resolve(repoRoot, "extension", "lib", "Readability.min.js");
const redditFixturePath = resolve(repoRoot, "test", "fixtures", "reddit-thread.html");

const [popupSource, readabilitySource] = await Promise.all([
  readFile(popupSourcePath, "utf8"),
  readFile(readabilitySourcePath, "utf8")
]);

const getWholeTextSource = popupSource.match(/const getWholeText = \(\) => \{[\s\S]*?\n\};/)?.[0];

if (!getWholeTextSource) {
  throw new Error("Could not find getWholeText in popup.js");
}

const createExtractionEnvironment = ({ html, articleText, bodyText } = {}) => {
  const dom = new JSDOM(html || "<!doctype html><html><body></body></html>", {
    runScripts: "dangerously"
  });

  dom.window.eval(readabilitySource);

  if (articleText !== undefined) {

    dom.window.Readability = class {
      parse() {
        return articleText === null ? null : { textContent: articleText };
      }
    };
  }

  const resolvedBodyText = bodyText ?? dom.window.document.body.textContent;

  Object.defineProperty(dom.window.document.body, "innerText", {
    configurable: true,
    value: resolvedBodyText
  });

  dom.window.eval(`${getWholeTextSource}; window.getWholeText = getWholeText;`);

  return {
    document: dom.window.document,
    getWholeText: dom.window.getWholeText,
    close() {
      dom.window.close();
    }
  };
};

afterAll(() => {
  delete globalThis.Readability;
});

describe("getWholeText Readability fallback", () => {
  it("falls back to the complete body text for the Reddit fixture", async () => {
    const fixtureHtml = await readFile(redditFixturePath, "utf8");
    const environment = createExtractionEnvironment({ html: fixtureHtml });
    const wholeText = environment.document.body.innerText;

    try {
      const extractedText = environment.getWholeText();

      expect(wholeText.length).toBeGreaterThan(500);
      expect(extractedText).toBe(wholeText);
      expect(extractedText).toContain("The selected comment");
      expect(extractedText).toContain("This is visible page text from navigation");
    } finally {
      environment.close();
    }
  });

  it("falls back when the extracted text is shorter than 500 characters", () => {
    const environment = createExtractionEnvironment({
      articleText: "a".repeat(499),
      bodyText: "complete page text"
    });

    try {
      expect(environment.getWholeText()).toBe("complete page text");
    } finally {
      environment.close();
    }
  });

  it("keeps extracted text at exactly 500 normalized characters", () => {
    const extractedText = "a".repeat(500);

    const environment = createExtractionEnvironment({
      articleText: extractedText,
      bodyText: "complete page text"
    });

    try {
      expect(environment.getWholeText()).toBe(extractedText);
    } finally {
      environment.close();
    }
  });

  it("normalizes whitespace before applying the threshold", () => {
    const extractedText = `${"a".repeat(499)}\n${"\n".repeat(20)}`;

    const environment = createExtractionEnvironment({
      articleText: extractedText,
      bodyText: "complete page text"
    });

    try {
      expect(environment.getWholeText()).toBe("complete page text");
    } finally {
      environment.close();
    }
  });

  it.each([
    { name: "null", articleText: null },
    { name: "empty", articleText: "" }
  ])("falls back when Readability returns $name text", ({ articleText }) => {
    const environment = createExtractionEnvironment({
      articleText,
      bodyText: "complete page text"
    });

    try {
      expect(environment.getWholeText()).toBe("complete page text");
    } finally {
      environment.close();
    }
  });
});
