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
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  });

  return htmlDiv.innerHTML;
};

export const getModelId = (languageModel, userModelId) => {
  const languageModelKey = languageModel.split(":")[0];

  const modelMappings = {
    "2.0-flash": "gemini-2.0-flash",
    "2.0-flash-lite": "gemini-2.0-flash-lite",
    "1.5-pro": "gemini-1.5-pro",
    "1.5-flash": "gemini-1.5-flash",
    "1.5-flash-8b": "gemini-1.5-flash-8b",
    "2.5-pro-preview-05-06": "gemini-2.5-pro-preview-05-06",
    "2.5-flash-preview-05-20": "gemini-2.5-flash-preview-05-20",
    "2.5-pro-exp-03-25": "gemini-2.5-pro-exp-03-25",
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

export const streamGenerateContent = async (apiKey, modelId, apiContents, apiConfig) => {
  try {
    await chrome.storage.session.remove("streamContent");

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
          await chrome.storage.session.set({ streamContent: content });
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

export const createContextMenus = async (useContextMenus, label1, label2, label3) => {
  if (!chrome.contextMenus) {
    // Firefox for Android does not support chrome.contextMenus
    return;
  }

  await chrome.contextMenus.removeAll();

  if (useContextMenus) {
    chrome.contextMenus.create({
      id: "standard-action",
      title: chrome.i18n.getMessage("context_standard_action"),
      contexts: ["page", "selection", "action"]
    });

    chrome.contextMenus.create({
      id: "custom-action-1",
      title: label1 || chrome.i18n.getMessage("context_custom_action_1"),
      contexts: ["page", "selection", "action"]
    });

    chrome.contextMenus.create({
      id: "custom-action-2",
      title: label2 || chrome.i18n.getMessage("context_custom_action_2"),
      contexts: ["page", "selection", "action"]
    });

    chrome.contextMenus.create({
      id: "custom-action-3",
      title: label3 || chrome.i18n.getMessage("context_custom_action_3"),
      contexts: ["page", "selection", "action"]
    });
  }
};
