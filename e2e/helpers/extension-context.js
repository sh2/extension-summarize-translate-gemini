import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const EXTENSION_SOURCE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../extension"
);

const E2E_HOST_PERMISSIONS = ["http://127.0.0.1/*"];

export const prepareExtensionCopy = async () => {
  const extensionDir = await mkdtemp(path.join(os.tmpdir(), "e2e-extension-"));

  await cp(EXTENSION_SOURCE_DIR, extensionDir, { recursive: true });

  const manifestPath = path.join(extensionDir, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  manifest.host_permissions = E2E_HOST_PERMISSIONS;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return extensionDir;
};

export const getServiceWorker = async (context) => {
  const existingWorker = context.serviceWorkers()[0];

  if (existingWorker) {
    return existingWorker;
  }

  return await context.waitForEvent("serviceworker");
};

export const launchExtensionContext = async (extensionDir) => {
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), "e2e-profile-"));
  let context;

  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: !process.env.E2E_HEADED,
      args: [
        `--disable-extensions-except=${extensionDir}`,
        `--load-extension=${extensionDir}`
      ]
    });
  } catch (error) {
    await rm(userDataDir, { recursive: true, force: true });
    throw error;
  }

  const worker = await getServiceWorker(context);
  const extensionId = new URL(worker.url()).hostname;

  return { context, extensionId, userDataDir };
};

export const seedOptions = async (worker, values) => {
  await worker.evaluate(async (newValues) => {
    await chrome.storage.local.set(newValues);
  }, values);
};

export const findTabByUrl = async (worker, urlPattern) => {
  const tab = await worker.evaluate(async (pattern) => {
    const tabs = await chrome.tabs.query({ url: pattern });

    if (tabs.length === 0) {
      return null;
    }

    const { id, url, title, windowId } = tabs[0];
    return { id, url, title, windowId };
  }, urlPattern);

  if (!tab) {
    throw new Error(`No tab found for URL pattern: ${urlPattern}`);
  }

  return tab;
};

export const closeExtensionContext = async (context, tempDirs) => {
  try {
    if (context) {
      await context.close();
    }
  } finally {
    for (const dir of tempDirs) {
      await rm(dir, { recursive: true, force: true });
    }
  }
};
