export const installChromeStorageSessionMock = () => {
  const originalChrome = globalThis.chrome;
  const values = {};
  const setCalls = [];
  const removeCalls = [];

  const session = {
    set: async (items) => {
      const snapshot = { ...items };
      setCalls.push(snapshot);
      Object.assign(values, snapshot);
    },
    remove: async (keys) => {
      removeCalls.push(keys);
      const keyList = Array.isArray(keys) ? keys : [keys];

      for (const key of keyList) {
        delete values[key];
      }
    }
  };

  globalThis.chrome = {
    ...(originalChrome ?? {}),
    storage: {
      ...(originalChrome?.storage ?? {}),
      session
    }
  };

  return {
    values,
    setCalls,
    removeCalls,
    restore: () => {
      if (typeof originalChrome === "undefined") {
        delete globalThis.chrome;
      } else {
        globalThis.chrome = originalChrome;
      }
    }
  };
};