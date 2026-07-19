import { describe, expect, it } from "vitest";
import { createHostPermissionSaveGuard, createOptionsActionHandlers } from "../../extension/options.js";

const createGuardHarness = ({
  options = { apiProvider: "openai", openaiBaseUrl: "https://example.com/v1" },
  ensurePermission = async () => ({ status: "granted" })
} = {}) => {
  const calls = {
    saveCount: 0,
    persistentMessages: [],
    errorLogs: []
  };

  const { saveWithHostPermission } = createHostPermissionSaveGuard({
    getOptions: () => options,
    ensurePermission,
    save: async () => {
      calls.saveCount += 1;
    },
    setPersistentStatus: (message) => {
      calls.persistentMessages.push(message);
    },
    getMessage: (key) => `message:${key}`,
    logError: (...args) => {
      calls.errorLogs.push(args);
    }
  });

  return {
    calls,
    saveWithHostPermission
  };
};

const createActionHarness = ({ saveResult = { status: "granted" } } = {}) => {
  const calls = {
    saveInvocations: 0,
    clearCount: 0,
    statusMessages: [],
    downloadedOptions: [],
    syncedOptions: [],
    errorLogs: []
  };

  const handlers = createOptionsActionHandlers({
    getIsInitialized: () => true,
    saveWithHostPermission: async () => {
      calls.saveInvocations += 1;
      return saveResult;
    },
    clearPersistentStatus: () => {
      calls.clearCount += 1;
    },
    setPersistentStatus: () => {},
    showStatus: (message, duration) => {
      calls.statusMessages.push({ message, duration });
    },
    getMessage: (key) => `message:${key}`,
    getOptions: (includeApiKey) => ({ includeApiKey }),
    isExportApiKeyEnabled: () => true,
    downloadOptions: (options) => {
      calls.downloadedOptions.push(options);
    },
    syncOptions: async (options) => {
      calls.syncedOptions.push(options);
    },
    getCloudOptions: async () => ({}),
    createImportInput: () => ({
      type: "",
      accept: "",
      addEventListener() {},
      click() {}
    }),
    applyOptions: () => {},
    needsPermissionPromptForOptions: async () => false,
    logError: (...args) => {
      calls.errorLogs.push(args);
    },
    logInfo: () => {}
  });

  return {
    calls,
    handlers
  };
};

describe("createHostPermissionSaveGuard", () => {
  it("stops saving and keeps the host-permission reminder when permission is denied", async () => {
    const { calls, saveWithHostPermission } = createGuardHarness({
      ensurePermission: async () => ({ status: "denied" })
    });

    await expect(saveWithHostPermission()).resolves.toEqual({ status: "denied" });
    expect(calls.saveCount).toBe(0);
    expect(calls.persistentMessages).toEqual(["message:options_save_required_for_host_permission"]);
    expect(calls.errorLogs).toEqual([]);
  });

  it("stops saving and logs an error when the permission API fails", async () => {
    const error = new Error("permissions unavailable");

    const { calls, saveWithHostPermission } = createGuardHarness({
      ensurePermission: async () => ({ status: "error", error })
    });

    const result = await saveWithHostPermission();

    expect(result).toEqual({ status: "error", error });
    expect(calls.saveCount).toBe(0);
    expect(calls.persistentMessages).toEqual(["message:options_host_permission_request_failed"]);
    expect(calls.errorLogs).toEqual([["Failed to request host permission:", error]]);
  });

  it("saves once permission is granted and skips permission checks for Gemini or an empty Base URL", async () => {
    const grantedHarness = createGuardHarness();

    const geminiHarness = createGuardHarness({
      options: { apiProvider: "gemini", openaiBaseUrl: "https://example.com/v1" },
      ensurePermission: async () => {
        throw new Error("ensurePermission should not run for Gemini");
      }
    });

    const emptyBaseUrlHarness = createGuardHarness({
      options: { apiProvider: "openai", openaiBaseUrl: "   " },
      ensurePermission: async () => {
        throw new Error("ensurePermission should not run for an empty Base URL");
      }
    });

    await expect(grantedHarness.saveWithHostPermission()).resolves.toEqual({ status: "granted" });
    await expect(geminiHarness.saveWithHostPermission()).resolves.toEqual({ status: "granted" });
    await expect(emptyBaseUrlHarness.saveWithHostPermission()).resolves.toEqual({ status: "granted" });
    expect(grantedHarness.calls.saveCount).toBe(1);
    expect(geminiHarness.calls.saveCount).toBe(1);
    expect(emptyBaseUrlHarness.calls.saveCount).toBe(1);
  });
});

describe("createOptionsActionHandlers", () => {
  it("routes Save, Export, and Sync through the shared host-permission guard", async () => {
    const { calls, handlers } = createActionHarness();

    await handlers.handleSaveClick();
    await handlers.handleExportClick();
    await handlers.handleSyncClick();

    expect(calls.saveInvocations).toBe(3);
    expect(calls.clearCount).toBe(3);

    expect(calls.statusMessages).toEqual([
      { message: "message:options_saved", duration: 1000 },
      { message: "message:options_saved", duration: 1000 },
      { message: "message:options_sync_cloud_started", duration: 1000 }
    ]);

    expect(calls.downloadedOptions).toEqual([{ includeApiKey: true }]);
    expect(calls.syncedOptions).toEqual([{ includeApiKey: true }]);
    expect(calls.errorLogs).toEqual([]);
  });

  it("prevents follow-up Save, Export, and Sync work when the guard blocks saving", async () => {
    const { calls, handlers } = createActionHarness({ saveResult: { status: "denied" } });

    await handlers.handleSaveClick();
    await handlers.handleExportClick();
    await handlers.handleSyncClick();

    expect(calls.saveInvocations).toBe(3);
    expect(calls.clearCount).toBe(0);
    expect(calls.statusMessages).toEqual([]);
    expect(calls.downloadedOptions).toEqual([]);
    expect(calls.syncedOptions).toEqual([]);
  });
});