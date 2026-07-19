import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { updateProviderCards } from "../../extension/options.js";
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

describe("updateProviderCards", () => {
  it("keeps the selected provider label exclusive and restores it after i18n rewrites", () => {
    updateProviderCards(environment.document, true, "Selected");

    expect(environment.getProviderSection("geminiSection").classList.contains("is-inactive-provider")).toBe(false);
    expect(environment.getProviderSection("openaiSection").classList.contains("is-inactive-provider")).toBe(true);
    expect(environment.getProviderSection("geminiSection").querySelector(".provider-status")?.textContent).toBe("Selected");
    expect(environment.getProviderSection("openaiSection").querySelector(".provider-status")?.textContent).toBe("");

    updateProviderCards(environment.document, false, "Selected");

    expect(environment.getProviderSection("geminiSection").classList.contains("is-inactive-provider")).toBe(true);
    expect(environment.getProviderSection("openaiSection").classList.contains("is-inactive-provider")).toBe(false);
    expect(environment.getProviderSection("geminiSection").querySelector(".provider-status")?.textContent).toBe("");
    expect(environment.getProviderSection("openaiSection").querySelector(".provider-status")?.textContent).toBe("Selected");

    environment.document.querySelectorAll("[data-i18n]").forEach((element) => {
      element.textContent = "Translated";
    });

    updateProviderCards(environment.document, true, "Selected");

    expect(environment.getProviderSection("geminiSection").querySelector(".provider-status")?.textContent).toBe("Selected");
    expect(environment.getProviderSection("openaiSection").querySelector(".provider-status")?.textContent).toBe("");
  });
});