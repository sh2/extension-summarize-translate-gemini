import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPersistentStatusUpdater } from "../../extension/options.js";
import { createOptionsTestEnvironment } from "../helpers/options-dom.js";

let environment;

beforeEach(() => {
  environment = createOptionsTestEnvironment();
});

afterEach(() => {
  if (environment) {
    environment.restore();
    environment = null;
  }
});

describe("createPersistentStatusUpdater", () => {
  it("announces on the next frame, cancels stale frames, and clears immediately", () => {
    const frameCallbacks = new Map();
    let nextFrameId = 1;
    let syncCount = 0;

    const requestFrame = (callback) => {
      const frameId = nextFrameId;

      frameCallbacks.set(frameId, callback);
      nextFrameId += 1;
      return frameId;
    };

    const cancelFrame = (frameId) => {
      frameCallbacks.delete(frameId);
    };

    const flushFrames = () => {
      const entries = Array.from(frameCallbacks.entries());

      frameCallbacks.clear();

      entries.forEach(([, callback]) => {
        callback();
      });
    };

    const { setPersistentStatus, clearPersistentStatus } = createPersistentStatusUpdater(
      environment.getPersistentStatusElement(),
      () => {
        syncCount += 1;
      },
      requestFrame,
      cancelFrame
    );

    setPersistentStatus("First warning");
    expect(environment.getPersistentStatusElement().hidden).toBe(false);
    expect(environment.getPersistentStatusElement().textContent).toBe("");
    expect(syncCount).toBe(0);

    flushFrames();
    expect(environment.getPersistentStatusElement().textContent).toBe("First warning");
    expect(syncCount).toBe(1);

    setPersistentStatus("Stale warning");
    clearPersistentStatus();
    expect(environment.getPersistentStatusElement().hidden).toBe(true);
    expect(environment.getPersistentStatusElement().textContent).toBe("");
    expect(syncCount).toBe(2);

    flushFrames();
    expect(environment.getPersistentStatusElement().hidden).toBe(true);
    expect(environment.getPersistentStatusElement().textContent).toBe("");
    expect(syncCount).toBe(2);

    setPersistentStatus("Old warning");
    setPersistentStatus("New warning");
    flushFrames();

    expect(environment.getPersistentStatusElement().hidden).toBe(false);
    expect(environment.getPersistentStatusElement().textContent).toBe("New warning");
    expect(syncCount).toBe(3);
  });
});