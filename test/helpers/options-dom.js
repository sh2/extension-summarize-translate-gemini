import { JSDOM } from "jsdom";

const optionsDomHtml = `<!doctype html>
<html>
  <body>
    <section class="card" id="sec-gemini">
      <div id="geminiSection" class="provider-card-content">
        <h2>
          <span data-i18n="options_provider_gemini">Gemini API</span>
          <span class="provider-status"></span>
        </h2>
      </div>
    </section>
    <section class="card" id="sec-openai">
      <div id="openaiSection" class="provider-card-content">
        <h2>
          <span data-i18n="options_provider_openai">OpenAI-compatible API</span>
          <span class="provider-status"></span>
        </h2>
      </div>
    </section>
    <input id="providerGemini" type="radio" name="apiProvider" value="gemini" checked>
    <input id="providerOpenai" type="radio" name="apiProvider" value="openai">
    <button id="save" disabled></button>
    <button id="exportFile" disabled></button>
    <button id="importFile" disabled></button>
    <button id="syncCloud" disabled></button>
    <button id="restoreCloud" disabled></button>
    <span id="persistentStatus" role="status" hidden></span>
  </body>
</html>`;

export const createOptionsTestEnvironment = () => {
  const dom = new JSDOM(optionsDomHtml);

  return {
    window: dom.window,
    document: dom.window.document,
    getProviderSection(sectionId) {
      return dom.window.document.getElementById(sectionId);
    },
    getPersistentStatusElement() {
      return dom.window.document.getElementById("persistentStatus");
    },
    restore() {
      dom.window.close();
    }
  };
};