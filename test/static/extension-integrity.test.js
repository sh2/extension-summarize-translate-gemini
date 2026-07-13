import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDirectory, "..", "..");
const extensionRoot = resolve(repoRoot, "extension");
const localesRoot = resolve(extensionRoot, "_locales");

const readJson = async (absolutePath) => {
  return JSON.parse(await readFile(absolutePath, "utf8"));
};

const isInsideExtensionRoot = (absolutePath) => {
  const extensionRelativePath = relative(extensionRoot, absolutePath);

  return extensionRelativePath !== "" && !extensionRelativePath.startsWith("..") && !extensionRelativePath.includes("../");
};

const resolveManifestFilePath = (manifestPath) => {
  expect(typeof manifestPath).toBe("string");
  expect(manifestPath).not.toBe("");

  const absolutePath = resolve(extensionRoot, ...manifestPath.split("/"));

  expect(isInsideExtensionRoot(absolutePath)).toBe(true);
  return absolutePath;
};

const collectManifestFilePaths = (manifest) => {
  const filePaths = [];

  if (manifest.icons) {
    filePaths.push(...Object.values(manifest.icons));
  }

  if (manifest.action?.default_popup) {
    filePaths.push(manifest.action.default_popup);
  }

  if (manifest.background?.service_worker) {
    filePaths.push(manifest.background.service_worker);
  }

  if (Array.isArray(manifest.background?.scripts)) {
    filePaths.push(...manifest.background.scripts);
  }

  if (manifest.options_page) {
    filePaths.push(manifest.options_page);
  }

  if (Array.isArray(manifest.content_scripts)) {
    manifest.content_scripts.forEach((contentScript) => {
      if (Array.isArray(contentScript.js)) {
        filePaths.push(...contentScript.js);
      }

      if (Array.isArray(contentScript.css)) {
        filePaths.push(...contentScript.css);
      }
    });
  }

  return [...new Set(filePaths)];
};

describe("extension integrity", () => {
  it("keeps Chrome and Firefox manifest versions aligned", async () => {
    const chromeManifest = await readJson(resolve(extensionRoot, "manifest.json"));
    const firefoxManifest = await readJson(resolve(repoRoot, "firefox", "manifest.json"));

    expect(typeof chromeManifest.version).toBe("string");
    expect(chromeManifest.version).not.toBe("");
    expect(typeof firefoxManifest.version).toBe("string");
    expect(firefoxManifest.version).not.toBe("");
    expect(chromeManifest.version).toBe(firefoxManifest.version);
  });

  it("keeps required manifest file references present inside extension", async () => {
    const manifests = [
      {
        name: "chrome",
        manifest: await readJson(resolve(extensionRoot, "manifest.json"))
      },
      {
        name: "firefox",
        manifest: await readJson(resolve(repoRoot, "firefox", "manifest.json"))
      }
    ];

    for (const { name, manifest } of manifests) {
      const manifestFilePaths = collectManifestFilePaths(manifest);

      expect(manifestFilePaths.length).toBeGreaterThan(0);

      for (const manifestPath of manifestFilePaths) {
        const absolutePath = resolveManifestFilePath(manifestPath);
        const fileStats = await stat(absolutePath);

        expect(fileStats.isFile(), `${name}:${manifestPath}`).toBe(true);
      }
    }
  });

  it("keeps locale message keys aligned with English", async () => {
    const englishMessagesPath = resolve(localesRoot, "en", "messages.json");
    const englishMessages = await readJson(englishMessagesPath);
    const englishKeys = Object.keys(englishMessages).sort();
    const localeDirectories = await readdir(localesRoot, { withFileTypes: true });

    for (const localeDirectory of localeDirectories) {
      if (!localeDirectory.isDirectory()) {
        continue;
      }

      const localeMessages = await readJson(resolve(localesRoot, localeDirectory.name, "messages.json"));
      const localeKeys = Object.keys(localeMessages).sort();
      const missingKeys = englishKeys.filter((key) => !localeKeys.includes(key));
      const extraKeys = localeKeys.filter((key) => !englishKeys.includes(key));

      expect({
        locale: localeDirectory.name,
        missingKeys,
        extraKeys
      }).toEqual({
        locale: localeDirectory.name,
        missingKeys: [],
        extraKeys: []
      });
    }
  });
});