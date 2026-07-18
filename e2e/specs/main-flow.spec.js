import { test, expect } from "@playwright/test";

import {
  closeExtensionContext,
  findTabByUrl,
  getServiceWorker,
  launchExtensionContext,
  prepareExtensionCopy,
  seedOptions
} from "../helpers/extension-context.js";
import { startLocalServer } from "../helpers/local-server.js";

const SELECTED_TEXT =
  "The town library of Northgate opened its new reading garden last spring. " +
  "Volunteers planted rows of lavender and sunflowers around the wooden benches. " +
  "Residents now borrow novels and read outside until sunset.";

const SUMMARY_RESPONSE = "1. Alpha point.\n2. Beta point.";
const FOLLOWUP_QUESTION = "What is the second point?";
const FOLLOWUP_RESPONSE = "The second point is Beta.";

test("summarize a selection in the popup, view results, follow up, and restore after reload", async () => {
  const pageErrors = [];
  const server = await startLocalServer();
  let extensionDir;
  let context;
  let userDataDir;

  try {
    let extensionId;
    let popupPage;
    let resultsPage;

    await test.step("E-01: start the environment and seed options", async () => {
      server.enqueueResponse(SUMMARY_RESPONSE);

      extensionDir = await prepareExtensionCopy();
      ({ context, extensionId, userDataDir } = await launchExtensionContext(extensionDir));

      const worker = await getServiceWorker(context);

      expect(extensionId).toBeTruthy();

      await seedOptions(worker, {
        apiProvider: "openai",
        openaiApiKey: "test-api-key",
        openaiBaseUrl: server.origin,
        openaiModelId: "gpt-test",
        streaming: false,
        textAction: "summarize",
        languageCode: "en"
      });
    });

    let fixtureTab;

    await test.step("E-02: open the fixture page and select the known paragraph", async () => {
      const fixturePage = await context.newPage();

      await fixturePage.goto(`${server.origin}/article.html`);

      await fixturePage.evaluate(() => {
        const paragraph = document.getElementById("target-paragraph");
        const range = document.createRange();

        range.selectNodeContents(paragraph);

        const selection = window.getSelection();

        selection.removeAllRanges();
        selection.addRange(range);
      });

      // Do not interact with the fixture page after this point; clicking it
      // would clear the selection that the popup is going to extract.
      const worker = await getServiceWorker(context);
      const tab = await findTabByUrl(worker, "http://127.0.0.1/*");

      expect(tab.title).toBe("Test Article");
      fixtureTab = { ...tab, active: true };
    });

    await test.step("E-03: run the summarization from the popup and show the result", async () => {
      popupPage = await context.newPage();

      popupPage.on("pageerror", (error) => {
        pageErrors.push(error);
      });

      // Stub only the active-tab lookup so that the popup targets the fixture
      // tab; every other chrome API call goes through the real implementation.
      await popupPage.addInitScript((tabInfo) => {
        const originalQuery = chrome.tabs.query.bind(chrome.tabs);

        chrome.tabs.query = (queryInfo) => {
          if (queryInfo && queryInfo.active === true && queryInfo.currentWindow === true) {
            return Promise.resolve([tabInfo]);
          }

          return originalQuery(queryInfo);
        };
      }, fixtureTab);

      await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

      await expect(popupPage.locator("#content")).toContainText("Alpha point");

      expect(server.requests).toHaveLength(1);

      const [summaryRequest] = server.requests;

      expect(summaryRequest.method).toBe("POST");
      expect(summaryRequest.path).toBe("/chat/completions");
      expect(summaryRequest.headers.authorization).toBe("Bearer test-api-key");
      expect(summaryRequest.body.model).toBe("gpt-test");
      expect(summaryRequest.body.stream).not.toBe(true);
      expect(summaryRequest.body.messages[0].role).toBe("system");
      expect(summaryRequest.body.messages[1].role).toBe("user");
      expect(summaryRequest.body.messages[1].content).toContain(SELECTED_TEXT);
    });

    await test.step("E-04: open the results page and show the result", async () => {
      const [newResultsPage] = await Promise.all([
        context.waitForEvent("page"),
        popupPage.click("#results")
      ]);

      resultsPage = newResultsPage;

      resultsPage.on("pageerror", (error) => {
        pageErrors.push(error);
      });

      expect(resultsPage.url()).toContain("results.html?i=");
      await expect(resultsPage.locator("#content")).toContainText("Alpha point");
      await expect(resultsPage.locator("#page-source-title")).toHaveText("Test Article");
    });

    await test.step("E-05: send a follow-up and show the conversation", async () => {
      server.enqueueResponse(FOLLOWUP_RESPONSE);

      await resultsPage.fill("#text", FOLLOWUP_QUESTION);
      await expect(resultsPage.locator("#send")).toBeEnabled();
      await resultsPage.click("#send");

      await expect(resultsPage.locator("#conversation")).toContainText(FOLLOWUP_QUESTION);
      await expect(resultsPage.locator("#conversation")).toContainText("The second point is Beta");

      expect(server.requests).toHaveLength(2);

      const followupRequest = server.requests[1];

      expect(followupRequest.body.messages.map(message => message.role))
        .toEqual(["system", "user", "assistant", "user"]);

      expect(followupRequest.body.messages[2].content).toBe(SUMMARY_RESPONSE);
      expect(followupRequest.body.messages[3].content).toBe(FOLLOWUP_QUESTION);
    });

    await test.step("E-06: restore the conversation after a reload", async () => {
      await resultsPage.reload();

      await expect(resultsPage.locator("#content")).toContainText("Alpha point");
      await expect(resultsPage.locator("#conversation")).toContainText(FOLLOWUP_QUESTION);
      await expect(resultsPage.locator("#conversation")).toContainText("The second point is Beta");

      expect(server.requests).toHaveLength(2);
    });
  } finally {
    await closeExtensionContext(context, [extensionDir, userDataDir].filter(Boolean));
    await server.stop();
  }

  expect(pageErrors).toEqual([]);
});
