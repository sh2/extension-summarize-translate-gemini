import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDirectory, "..", "..");
const optionsHtmlPath = resolve(repoRoot, "extension", "options.html");
const templatesHtmlPath = resolve(repoRoot, "extension", "templates.html");

const sectionIds = [
  "sec-provider",
  "sec-gemini",
  "sec-openai",
  "sec-language",
  "sec-default-no-selection",
  "sec-default-selection",
  "sec-custom-no-selection",
  "sec-custom-selection",
  "sec-behavior",
  "sec-appearance",
  "sec-backup"
];

const requiredStaticIds = [
  "header",
  "providerGemini",
  "providerOpenai",
  "geminiSection",
  "apiKey",
  "languageModelContainer",
  "userModelId",
  "openaiSection",
  "openaiApiKey",
  "openaiBaseUrl",
  "openaiModelId",
  "openaiReasoningEffort",
  "openaiThinkingType",
  "languageCodeContainer",
  "userLanguage",
  "noTextSummarize",
  "noTextTranslate",
  "noTextCustom1",
  "noTextCustom2",
  "noTextCustom3",
  "textSummarize",
  "textTranslate",
  "textCustom1",
  "textCustom2",
  "textCustom3",
  "contextMenuLabel1",
  "contextMenuLabel2",
  "contextMenuLabel3",
  "noTextCustomPrompt1",
  "noTextCustomPrompt2",
  "noTextCustomPrompt3",
  "contextMenuLabel1Text",
  "contextMenuLabel2Text",
  "contextMenuLabel3Text",
  "textCustomPrompt1",
  "textCustomPrompt2",
  "textCustomPrompt3",
  "contextMenus",
  "streaming",
  "renderLinks",
  "autoSave",
  "openResultsInTab",
  "theme",
  "fontSize",
  "save",
  "status",
  "persistentStatus",
  "exportFile",
  "importFile",
  "syncCloud",
  "restoreCloud",
  "exportApiKey"
];

const fieldsetSectionIds = [
  "sec-provider",
  "sec-default-no-selection",
  "sec-default-selection",
  "sec-behavior"
];

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

describe("options page structure", () => {
  it("keeps the planned section, label, and stylesheet structure", async () => {
    const optionsDom = await parseHtmlDocument(optionsHtmlPath);
    const templatesDom = await parseHtmlDocument(templatesHtmlPath);
    const optionsDocument = optionsDom.document;
    const templatesDocument = templatesDom.document;

    try {
      const actualSectionIds = Array.from(optionsDocument.querySelectorAll("main > section.card[id^='sec-']"), (section) => section.id);
      const sidebarTargets = Array.from(optionsDocument.querySelectorAll(".sidebar a"), (link) => link.getAttribute("href"));
      const stylesheetPaths = Array.from(optionsDocument.querySelectorAll("head link[rel='stylesheet']"), (link) => link.getAttribute("href"));

      expect(actualSectionIds).toEqual(sectionIds);
      expect(sidebarTargets).toEqual(sectionIds.map((sectionId) => `#${sectionId}`));
      expect(stylesheetPaths).toEqual(["css/new.min.css", "css/common.css", "css/options.css"]);

      requiredStaticIds.forEach((elementId) => {
        expect(optionsDocument.querySelectorAll(`#${elementId}`)).toHaveLength(1);
      });

      ["save", "exportFile", "importFile", "syncCloud", "restoreCloud"].forEach((elementId) => {
        const button = optionsDocument.getElementById(elementId);

        expect(button?.tagName).toBe("BUTTON");
        expect(button?.hasAttribute("disabled")).toBe(true);
      });

      ["geminiSection", "openaiSection"].forEach((elementId) => {
        const heading = optionsDocument.querySelector(`#${elementId} h2`);
        const headingSpans = heading ? Array.from(heading.children) : [];

        expect(headingSpans).toHaveLength(2);
        expect(headingSpans[0]?.matches("span[data-i18n]")).toBe(true);
        expect(headingSpans[1]?.matches("span.provider-status")).toBe(true);
      });

      Array.from(optionsDocument.querySelectorAll("input[id], select[id], textarea[id]")).forEach((control) => {
        const labels = optionsDocument.querySelectorAll(`label[for="${control.id}"]`);

        expect(labels).toHaveLength(1);
      });

      Array.from(optionsDocument.querySelectorAll("[aria-describedby]")).forEach((element) => {
        const describedByIds = element.getAttribute("aria-describedby").split(/\s+/).filter(Boolean);

        describedByIds.forEach((describedById) => {
          expect(optionsDocument.getElementById(describedById)).not.toBeNull();
        });
      });

      fieldsetSectionIds.forEach((sectionId) => {
        const fieldset = optionsDocument.querySelector(`#${sectionId} fieldset`);

        expect(fieldset).not.toBeNull();
        expect(fieldset?.querySelector("legend")).not.toBeNull();
      });

      Array.from(optionsDocument.querySelectorAll('a[target="_blank"]')).forEach((anchor) => {
        const relParts = new Set((anchor.getAttribute("rel") || "").split(/\s+/).filter(Boolean));

        expect(relParts.has("noopener")).toBe(true);
        expect(relParts.has("noreferrer")).toBe(true);
      });

      const languageModelTemplate = templatesDocument.getElementById("languageModelTemplate");
      const languageCodeTemplate = templatesDocument.getElementById("languageCodeTemplate");
      const languageModel = languageModelTemplate?.content.querySelector("#languageModel");
      const languageCode = languageCodeTemplate?.content.querySelector("#languageCode");

      expect(languageModel).not.toBeNull();
      expect(languageCode).not.toBeNull();
      expect(optionsDocument.querySelectorAll('label[for="languageModel"]')).toHaveLength(1);
      expect(optionsDocument.querySelectorAll('label[for="languageCode"]')).toHaveLength(1);
    } finally {
      optionsDom.close();
      templatesDom.close();
    }
  });
});