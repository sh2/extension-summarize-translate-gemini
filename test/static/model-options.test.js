import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDirectory, "..", "..");
const templatesHtmlPath = resolve(repoRoot, "extension", "templates.html");
const utilsJsPath = resolve(repoRoot, "extension", "utils.js");

const readLanguageModelOptionValues = async () => {
  const html = await readFile(templatesHtmlPath, "utf8");
  const dom = new JSDOM(html);

  // #languageModel lives inside <template id="languageModelTemplate">, so it is
  // only reachable through the template content.
  const template = dom.window.document.getElementById("languageModelTemplate");
  const select = template?.content.querySelector("#languageModel");

  return Array.from(select.options, (option) => option.value);
};

// Static tests must not execute extension code, so read the constant from
// source instead of importing it.
const readDefaultLanguageModel = async () => {
  const source = await readFile(utilsJsPath, "utf8");
  const match = source.match(/DEFAULT_LANGUAGE_MODEL\s*=\s*"([^"]+)"/);

  expect(match).not.toBeNull();
  return match[1];
};

describe("language model template options", () => {
  it("does not offer the removed Gemini 3.5 Flash and Gemini 3.7 Flash options", async () => {
    const optionValues = await readLanguageModelOptionValues();

    expect(optionValues.filter((value) => value.startsWith("3.5-flash:"))).toEqual([]);
    expect(optionValues.filter((value) => value.startsWith("3.7-flash:"))).toEqual([]);
  });

  it("keeps the Gemini 3.8 Flash, Gemini 3.6 Flash, and Gemini 3.5 Flash-Lite options", async () => {
    const optionValues = await readLanguageModelOptionValues();

    expect(optionValues).toEqual(expect.arrayContaining([
      "3.8-flash:high",
      "3.8-flash:medium",
      "3.8-flash:low",
      "3.6-flash:high",
      "3.6-flash:medium",
      "3.6-flash:low",
      "3.6-flash:minimal",
      "3.5-flash-lite:high",
      "3.5-flash-lite:medium",
      "3.5-flash-lite:low",
      "3.5-flash-lite:minimal"
    ]));
  });

  it("offers the default language model so the fallback target exists", async () => {
    const optionValues = await readLanguageModelOptionValues();

    expect(optionValues).toContain(await readDefaultLanguageModel());
  });
});
