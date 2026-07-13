import { readFile } from "node:fs/promises";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const helperDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(helperDirectory, "..", "..");
const markedSourcePath = resolve(repoRoot, "extension", "lib", "marked.umd.min.js");
const domPurifySourcePath = resolve(repoRoot, "extension", "lib", "purify.min.js");
const globalKeys = ["window", "document", "marked", "DOMPurify"];

let vendoredLibrarySourcesPromise;

const loadVendoredLibrarySources = async () => {
  if (!vendoredLibrarySourcesPromise) {
    vendoredLibrarySourcesPromise = Promise.all([
      readFile(markedSourcePath, "utf8"),
      readFile(domPurifySourcePath, "utf8")
    ]).then(([markedSource, domPurifySource]) => ({ markedSource, domPurifySource }));
  }

  return vendoredLibrarySourcesPromise;
};

const captureGlobals = () => {
  return globalKeys.map((key) => ({
    key,
    hadOwnProperty: Object.prototype.hasOwnProperty.call(globalThis, key),
    value: globalThis[key]
  }));
};

const restoreGlobals = (previousGlobals) => {
  previousGlobals.forEach(({ key, hadOwnProperty, value }) => {
    if (hadOwnProperty) {
      globalThis[key] = value;
    } else {
      delete globalThis[key];
    }
  });
};

export const createMarkdownTestEnvironment = async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    runScripts: "dangerously"
  });

  const previousGlobals = captureGlobals();
  const { markedSource, domPurifySource } = await loadVendoredLibrarySources();

  dom.window.eval(markedSource);
  dom.window.eval(domPurifySource);

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.marked = dom.window.marked;
  globalThis.DOMPurify = dom.window.DOMPurify;

  return {
    window: dom.window,
    document: dom.window.document,
    parseHtmlFragment(html) {
      const container = dom.window.document.createElement("div");

      container.innerHTML = html;
      return container;
    },
    restore() {
      restoreGlobals(previousGlobals);
      dom.window.close();
    }
  };
};

export const getRepoRelativePath = (absolutePath) => {
  return relative(repoRoot, absolutePath).replaceAll("\\", "/");
};