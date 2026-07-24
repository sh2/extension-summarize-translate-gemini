import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTransientStatusUpdater } from "../../extension/options.js";
import { createOptionsTestEnvironment } from "../helpers/options-dom.js";

let environment;

beforeEach(() => {
  vi.useFakeTimers();
  environment = createOptionsTestEnvironment();
});

afterEach(() => {
  vi.useRealTimers();

  if (environment) {
    environment.restore();
    environment = null;
  }
});

describe("createTransientStatusUpdater", () => {
  it("announces on the next frame and hides again after the timeout", () => {
    const frameCallbacks = new Map();
    let nextFrameId = 1;

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

    const { showStatus } = createTransientStatusUpdater(
      environment.getStatusElement(),
      requestFrame,
      cancelFrame
    );

    showStatus("Saved.", 1000);
    expect(environment.getStatusElement().hidden).toBe(false);
    expect(environment.getStatusElement().textContent).toBe("");

    flushFrames();
    expect(environment.getStatusElement().textContent).toBe("Saved.");
    expect(environment.getStatusElement().hidden).toBe(false);

    vi.advanceTimersByTime(999);
    expect(environment.getStatusElement().textContent).toBe("Saved.");
    expect(environment.getStatusElement().hidden).toBe(false);

    vi.advanceTimersByTime(1);
    expect(environment.getStatusElement().textContent).toBe("");
    expect(environment.getStatusElement().hidden).toBe(true);
  });

  it("cancels stale frames and timeouts before showing the newer message", () => {
    const frameCallbacks = new Map();
    let nextFrameId = 1;

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

    const { showStatus } = createTransientStatusUpdater(
      environment.getStatusElement(),
      requestFrame,
      cancelFrame
    );

    showStatus("Old message", 1000);
    showStatus("New message", 1000);
    flushFrames();

    expect(environment.getStatusElement().textContent).toBe("New message");
    expect(environment.getStatusElement().hidden).toBe(false);

    vi.advanceTimersByTime(1000);
    expect(environment.getStatusElement().textContent).toBe("");
    expect(environment.getStatusElement().hidden).toBe(true);

    showStatus("First timeout", 1000);
    flushFrames();
    vi.advanceTimersByTime(500);

    showStatus("Second timeout", 1000);
    expect(environment.getStatusElement().textContent).toBe("");
    flushFrames();

    vi.advanceTimersByTime(500);
    expect(environment.getStatusElement().textContent).toBe("Second timeout");
    expect(environment.getStatusElement().hidden).toBe(false);

    vi.advanceTimersByTime(500);
    expect(environment.getStatusElement().textContent).toBe("");
    expect(environment.getStatusElement().hidden).toBe(true);
  });

  it("does not hide the element when the text has been replaced outside the updater", () => {
    const frameCallbacks = new Map();
    let nextFrameId = 1;

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

    const { showStatus } = createTransientStatusUpdater(
      environment.getStatusElement(),
      requestFrame,
      cancelFrame
    );

    showStatus("Original message", 1000);
    flushFrames();

    environment.getStatusElement().textContent = "Manually replaced";
    vi.advanceTimersByTime(1000);

    expect(environment.getStatusElement().textContent).toBe("Manually replaced");
    expect(environment.getStatusElement().hidden).toBe(false);
  });
});
