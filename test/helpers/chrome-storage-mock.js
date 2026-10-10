export const installChromeStorageSessionMock = () => {
  const originalChrome = globalThis.chrome;
  const values = {};
  const getCalls = [];
  const setCalls = [];
  const removeCalls = [];

  const session = {
    get: async (keys) => {
      getCalls.push(keys);

      if (keys === null || keys === undefined) {
        return { ...values };
      }

      if (typeof keys === "string") {
        return keys in values ? { [keys]: values[keys] } : {};
      }

      if (Array.isArray(keys)) {
        const result = {};

        for (const key of keys) {
          if (key in values) {
            result[key] = values[key];
          }
        }

        return result;
      }

      // Object form: each key maps to its default value.
      const result = {};

      for (const [key, defaultValue] of Object.entries(keys)) {
        result[key] = key in values ? values[key] : defaultValue;
      }

      return result;
    },
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
    getCalls,
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