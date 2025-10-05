/* globals DOMPurify, marked */

const SAFETY_SETTINGS = [{
  category: "HARM_CATEGORY_HARASSMENT",
  threshold: "BLOCK_NONE"
},
{
  category: "HARM_CATEGORY_HATE_SPEECH",
  threshold: "BLOCK_NONE"
},
{
  category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  threshold: "BLOCK_NONE"
},
{
  category: "HARM_CATEGORY_DANGEROUS_CONTENT",
  threshold: "BLOCK_NONE"
},
{
  category: "HARM_CATEGORY_CIVIC_INTEGRITY",
  threshold: "BLOCK_NONE"
}];

const tryParseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text } };
  }
};

export const applyTheme = (theme) => {
  if (theme === "light") {
    document.body.setAttribute("data-theme", "light");
  } else if (theme === "dark") {
    document.body.setAttribute("data-theme", "dark");
  } else {
    document.body.removeAttribute("data-theme");
  }
};

export const applyFontSize = (fontSize) => {
  if (fontSize === "large") {
    document.body.setAttribute("data-font-size", "large");
  } else if (fontSize === "small") {
    document.body.setAttribute("data-font-size", "small");
  } else {
    document.body.setAttribute("data-font-size", "medium");
  }
};

export const loadTemplate = async (templateId) => {
  try {
    const response = await fetch(chrome.runtime.getURL("templates.html"));

    if (response.ok) {
      const text = await response.text();
      const parser = new DOMParser();
      const document = parser.parseFromString(text, "text/html");
      const element = document.getElementById(templateId);

      if (element) {
        return element.content.cloneNode(true);
      } else {
        console.error(`Failed to find the template: ${templateId}`);
        return null;
      }
    } else {
      console.error(`Failed to load the template: ${response.status}`);
      return null;
    }
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const displayLoadingMessage = (elementId, loadingMessage) => {
  const status = document.getElementById(elementId);

  switch (status.textContent) {
    case `${loadingMessage}.`:
      status.textContent = `${loadingMessage}..`;
      break;
    case `${loadingMessage}..`:
      status.textContent = `${loadingMessage}...`;
      break;
    default:
      status.textContent = `${loadingMessage}.`;
  }
};

export const convertMarkdownToHtml = (content, breaks) => {
  // Disable links when converting from Markdown to HTML
  marked.use({ renderer: { link: ({ text }) => text } });

  const markdownDiv = document.createElement("div");
  markdownDiv.textContent = content;
  const htmlDiv = document.createElement("div");
  htmlDiv.innerHTML = DOMPurify.sanitize(marked.parse(markdownDiv.innerHTML, { breaks: breaks }));

  // Replace the HTML entities with the original characters in the code blocks
  htmlDiv.querySelectorAll("code").forEach(codeBlock => {
    codeBlock.innerHTML = codeBlock.innerHTML
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&amp;", "&");
  });

  return htmlDiv.innerHTML;
};

export const getModelId = (languageModel, userModelId) => {
  const languageModelKey = languageModel.split(":")[0];

  const modelMappings = {
    "2.5-pro": "gemini-2.5-pro",
    "2.5-flash": "gemini-2.5-flash",
    "2.5-flash-lite": "gemini-2.5-flash-lite",
    "2.0-flash": "gemini-2.0-flash",
    "2.0-flash-lite": "gemini-2.0-flash-lite",
    "flash-latest": "gemini-flash-latest",
    "flash-lite-latest": "gemini-flash-lite-latest",
    "gemma-3-27b-it": "gemma-3-27b-it"
  };

  if (languageModel === "zz") {
    return userModelId.split(":")[0];
  } else {
    return modelMappings[languageModelKey];
  }
};

export const getThinkingBudget = (languageModel, userModelId) => {
  const modelIdWithBudget = languageModel === "zz" ? userModelId : languageModel;
  const thinkingBudgetInt = parseInt(modelIdWithBudget.split(":")[1]);
  return isNaN(thinkingBudgetInt) ? undefined : thinkingBudgetInt;
};

export const generateContent = async (apiKey, modelId, apiContents, apiConfig) => {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        contents: apiContents,
        safetySettings: SAFETY_SETTINGS,
        generationConfig: apiConfig
      })
    });

    return {
      ok: response.ok,
      status: response.status,
      body: tryParseJson(await response.text())
    };
  } catch (error) {
    return {
      ok: false,
      status: 1000,
      body: { error: { message: error.stack } }
    };
  }
};

export const streamGenerateContent = async (apiKey, modelId, apiContents, apiConfig, streamKey) => {
  try {
    await chrome.storage.session.remove(streamKey);

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        contents: apiContents,
        safetySettings: SAFETY_SETTINGS,
        generationConfig: apiConfig
      })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let content = "";
    let processed = -1;

    while (true) {
      const { value, done } = await reader.read();

      if (value) {
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        try {
          // To receive an array of candidates, temporarily terminate the array
          // and parse the buffer as JSON
          const json = JSON.parse(buffer + "]");

          // Concatenate the candidates
          for (let index = processed + 1; index < json.length; index++) {
            content += json[index]?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
            processed = index;
          }

          // Set the concatenated content to the session storage
          await chrome.storage.session.set({ [streamKey]: content });
        } catch {
          // If it cannot be parsed as JSON, wait for the next chunk
        }
      }

      if (done) {
        break;
      }
    }

    // To receive the last candidate, re-parse the buffer
    const json = JSON.parse(buffer);

    if (json.at(-1).error) {
      // If the last candidate is an error, return the error
      return {
        ok: false,
        status: json.at(-1).error.code,
        body: { error: { message: json.at(-1).error.message } }
      };
    }

    if (response.ok) {
      // Concatenate the remaining candidates
      for (let index = processed + 1; index < json.length; index++) {
        content += json[index]?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      }

      // Update the last candidate with the concatenated content
      json.at(-1).candidates[0].content.parts = [{ text: content }];
    }

    return {
      ok: response.ok,
      status: response.status,
      body: json.at(-1)
    };
  } catch (error) {
    return {
      ok: false,
      status: 1000,
      body: { error: { message: error.stack } }
    };
  }
};

const formatTitle = (label1, label1DefaultKey, label2, label2DefaultKey) => {
  const title1 = label1 || chrome.i18n.getMessage(label1DefaultKey);
  const title2 = label2 || chrome.i18n.getMessage(label2DefaultKey);
  return `${title1} / ${title2}`;
};

export const createContextMenus = async (useContextMenus, label1, label2, label3, label1Text, label2Text, label3Text) => {
  if (!chrome.contextMenus) {
    // Firefox for Android does not support chrome.contextMenus
    return;
  }

  await chrome.contextMenus.removeAll();

  if (useContextMenus) {
    chrome.contextMenus.create({
      id: "summarize",
      title: chrome.i18n.getMessage("options_action_summarize_selection"),
      contexts: ["page", "selection", "image", "action"]
    });

    chrome.contextMenus.create({
      id: "translate",
      title: chrome.i18n.getMessage("options_action_translate_no_selection"),
      contexts: ["page", "selection", "image", "action"]
    });

    chrome.contextMenus.create({
      id: "separator-1",
      type: "separator",
      contexts: ["action"]
    });

    chrome.contextMenus.create({
      id: "custom-action-1",
      title: formatTitle(label1, "options_action_custom_1_no_selection", label1Text, "options_action_custom_1_selection"),
      contexts: ["action"]
    });

    chrome.contextMenus.create({
      id: "custom-action-2",
      title: formatTitle(label2, "options_action_custom_2_no_selection", label2Text, "options_action_custom_2_selection"),
      contexts: ["action"]
    });

    chrome.contextMenus.create({
      id: "custom-action-3",
      title: formatTitle(label3, "options_action_custom_3_no_selection", label3Text, "options_action_custom_3_selection"),
      contexts: ["action"]
    });

    chrome.contextMenus.create({
      id: "separator-2",
      type: "separator",
      contexts: ["page", "selection", "image"]
    });

    chrome.contextMenus.create({
      id: "custom-action-1-no-selection",
      title: label1 || chrome.i18n.getMessage("options_action_custom_1_no_selection"),
      contexts: ["page", "selection", "image"]
    });

    chrome.contextMenus.create({
      id: "custom-action-2-no-selection",
      title: label2 || chrome.i18n.getMessage("options_action_custom_2_no_selection"),
      contexts: ["page", "selection", "image"]
    });

    chrome.contextMenus.create({
      id: "custom-action-3-no-selection",
      title: label3 || chrome.i18n.getMessage("options_action_custom_3_no_selection"),
      contexts: ["page", "selection", "image"]
    });

    chrome.contextMenus.create({
      id: "separator-3",
      type: "separator",
      contexts: ["page", "selection", "image"]
    });

    chrome.contextMenus.create({
      id: "custom-action-1-selection",
      title: label1Text || chrome.i18n.getMessage("options_action_custom_1_selection"),
      contexts: ["page", "selection", "image"]
    });

    chrome.contextMenus.create({
      id: "custom-action-2-selection",
      title: label2Text || chrome.i18n.getMessage("options_action_custom_2_selection"),
      contexts: ["page", "selection", "image"]
    });

    chrome.contextMenus.create({
      id: "custom-action-3-selection",
      title: label3Text || chrome.i18n.getMessage("options_action_custom_3_selection"),
      contexts: ["page", "selection", "image"]
    });
  }
};

export const exportTextToFile = (text) => {
  const currentDate = new Date();
  const adjustedDate = new Date(currentDate.getTime() - currentDate.getTimezoneOffset() * 60000);
  const localDateTimeString = adjustedDate.toISOString().split(".")[0].replaceAll("T", "_").replaceAll(":", "-");
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gemini-results_${localDateTimeString}.txt`;
  a.click();
  URL.revokeObjectURL(url);
};
