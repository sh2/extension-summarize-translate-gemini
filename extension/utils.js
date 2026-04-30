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

export const DEFAULT_LANGUAGE_MODEL = "3.1-flash-lite-preview:minimal";

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

const EXCLUDED_BASE_URLS = new Set([
  "https://api.openai.com/v1"
]);

export const normalizeBaseUrl = (baseUrl) => {
  const trimmedBaseUrl = baseUrl.trim();
  const url = new URL(trimmedBaseUrl);

  // Base URL comparison ignores search/hash.
  url.search = "";
  url.hash = "";

  // Remove trailing slashes for a canonical base URL.
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";

  return url.pathname === "/" ? url.origin : `${url.origin}${url.pathname}`;
};

const tryNormalizeBaseUrl = (baseUrl) => {
  if (!baseUrl) {
    return "";
  }

  try {
    return normalizeBaseUrl(baseUrl);
  } catch {
    return null;
  }
};

const isExcludedBaseUrl = (normalizedBaseUrl) => {
  return EXCLUDED_BASE_URLS.has(normalizedBaseUrl);
};

const getOriginPatternFromNormalizedBaseUrl = (normalizedBaseUrl) => {
  const url = new URL(normalizedBaseUrl);
  return `${url.protocol}//${url.host}/*`;
};

const buildOpenAIApiUrl = (baseUrl, endpointPath) => {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl || DEFAULT_OPENAI_BASE_URL);
  const normalizedEndpointPath = endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;
  return `${normalizedBaseUrl}${normalizedEndpointPath}`;
};

export const needsHostPermissionPrompt = async (baseUrl) => {
  const normalizedBaseUrl = tryNormalizeBaseUrl(baseUrl);

  if (!normalizedBaseUrl || isExcludedBaseUrl(normalizedBaseUrl)) {
    return false;
  }

  try {
    const origin = getOriginPatternFromNormalizedBaseUrl(normalizedBaseUrl);
    return !(await chrome.permissions.contains({ origins: [origin] }));
  } catch {
    return false;
  }
};

export const ensureHostPermission = async (baseUrl) => {
  const normalizedBaseUrl = tryNormalizeBaseUrl(baseUrl);

  if (!normalizedBaseUrl || isExcludedBaseUrl(normalizedBaseUrl)) {
    return true;
  }

  try {
    const origin = getOriginPatternFromNormalizedBaseUrl(normalizedBaseUrl);
    const hasPermission = await chrome.permissions.contains({ origins: [origin] });

    if (hasPermission) {
      return true;
    }

    return await chrome.permissions.request({ origins: [origin] });
  } catch {
    return false;
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

export const convertMarkdownToHtml = (content, breaks, links) => {
  const renderer = new marked.Renderer();

  if (!links) {
    renderer.link = ({ text }) => text;
  }

  const markdownDiv = document.createElement("div");
  markdownDiv.textContent = content;
  const htmlDiv = document.createElement("div");
  htmlDiv.innerHTML = DOMPurify.sanitize(marked.parse(markdownDiv.innerHTML, { breaks: breaks, renderer: renderer }));

  // Set links to open in a new tab with security attributes
  htmlDiv.querySelectorAll("a[href]").forEach(anchor => {
    anchor.setAttribute("target", "_blank");
    anchor.setAttribute("rel", "noopener noreferrer");
  });

  // Replace the HTML entities with the original characters in the code blocks
  htmlDiv.querySelectorAll("code").forEach(codeBlock => {
    codeBlock.innerHTML = codeBlock.innerHTML
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&amp;", "&");
  });

  return htmlDiv.innerHTML;
};

export const getModelConfigs = (languageModel, userModelId, apiProvider = "gemini") => {
  // languageModel: "3-flash-preview:minimal/2.5-flash:0/gemma-3-27b-it/zz"

  if (apiProvider === "openai") {
    return [{ modelId: userModelId, generationConfig: {} }];
  }

  const modelMappings = {
    "2.5-pro": "gemini-2.5-pro",
    "2.5-flash": "gemini-2.5-flash",
    "2.5-flash-lite": "gemini-2.5-flash-lite",
    "3.1-pro-preview": "gemini-3.1-pro-preview",
    "3.1-flash-lite-preview": "gemini-3.1-flash-lite-preview",
    "3-flash-preview": "gemini-3-flash-preview",
    "gemma-4-31b-it": "gemma-4-31b-it",
    "gemma-3-27b-it": "gemma-3-27b-it"
  };

  // modelSegments: ["3-flash-preview:minimal", "2.5-flash:0", "gemma-3-27b-it", "zz"]
  const modelSegments = languageModel.split("/");

  const modelConfigs = modelSegments.map(segment => {
    const resolvedSegment = segment === "zz" ? userModelId : segment;
    const segmentParts = resolvedSegment.split(":");
    const modelId = segment === "zz" ? segmentParts[0] : modelMappings[segmentParts[0]];
    let generationConfig = {};

    if (segmentParts.length >= 2) {
      const thinkingValue = segmentParts[1];

      if (["high", "medium", "low", "minimal"].includes(thinkingValue)) {
        generationConfig.thinkingConfig = { thinkingLevel: thinkingValue };
      } else {
        const thinkingBudgetInt = parseInt(thinkingValue);

        if (!isNaN(thinkingBudgetInt)) {
          generationConfig.thinkingConfig = { thinkingBudget: thinkingBudgetInt };
        }
      }
    }

    return { modelId, generationConfig };
  });

  // [{ "gemini-3-flash-preview", { thinkingConfig: { thinkingLevel: "minimal" }}}, ...]
  return modelConfigs;
};

const convertToOpenAI = (apiContents) => {
  return apiContents.map(item => {
    const converted = { role: item.role === "model" ? "assistant" : item.role };
    const parts = item.parts || [];
    const hasImage = parts.some(p => p.inline_data);

    if (hasImage) {
      converted.content = parts.map(p => {
        if (p.inline_data) {
          return {
            type: "image_url",
            image_url: { url: `data:${p.inline_data.mime_type};base64,${p.inline_data.data}` }
          };
        }

        return { type: "text", text: p.text || "" };
      });
    } else {
      converted.content = parts.map(p => p.text || "").join("");
    }

    return converted;
  });
};

const tryParseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text } };
  }
};

const generateContentGemini = async (apiKey, apiContents, modelConfig, systemInstruction) => {
  const { modelId, generationConfig } = modelConfig;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        contents: apiContents,
        systemInstruction: systemInstruction,
        safetySettings: SAFETY_SETTINGS,
        generationConfig: generationConfig
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

const generateContentOpenAI = async (apiKey, baseUrl, apiContents, modelConfig) => {
  const { modelId } = modelConfig;

  try {
    const response = await fetch(buildOpenAIApiUrl(baseUrl, "/chat/completions"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelId,
        messages: apiContents
      })
    });

    const body = tryParseJson(await response.text());

    return {
      ok: response.ok,
      status: response.status,
      body: body
    };
  } catch (error) {
    return {
      ok: false,
      status: 1000,
      body: { error: { message: error.stack } }
    };
  }
};

const generateContentWithFallback = async (apiKey, apiContents, modelConfigs, systemInstruction) => {
  let response = {
    ok: false,
    status: 1001,
    body: { error: { message: "No models available." } }
  };

  for (const modelConfig of modelConfigs) {
    response = await generateContentGemini(apiKey, apiContents, modelConfig, systemInstruction);

    if (response.ok || response.status !== 429) {
      break;
    }
  }

  return response;
};

const extractSystemInstruction = (apiContents) => {
  const systemParts = [];
  const otherContents = [];

  for (const item of apiContents) {
    if (item.role === "system") {
      systemParts.push(...(item.parts || []));
    } else {
      otherContents.push(item);
    }
  }

  if (systemParts.length > 0) {
    return { systemInstruction: { parts: systemParts }, contents: otherContents };
  }

  return { systemInstruction: undefined, contents: apiContents };
};

export const generateContent = async (apiKey, apiContents, modelConfigs, apiProvider, openaiBaseUrl) => {
  if (apiProvider === "openai") {
    const openaiContents = convertToOpenAI(apiContents);
    return await generateContentOpenAI(apiKey, openaiBaseUrl, openaiContents, modelConfigs[0]);
  }

  const { systemInstruction, contents } = extractSystemInstruction(apiContents);
  return await generateContentWithFallback(apiKey, contents, modelConfigs, systemInstruction);
};

const streamGenerateContentGemini = async (apiKey, apiContents, modelConfig, streamKey, systemInstruction) => {
  const { modelId, generationConfig } = modelConfig;

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
        systemInstruction: systemInstruction,
        safetySettings: SAFETY_SETTINGS,
        generationConfig: generationConfig
      })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let thought = "";
    let content = "";
    let hasThought = false;
    let processed = -1;

    const appendPartsText = (parts = []) => {
      if (parts[0]?.thought === true) {
        hasThought = true;
        thought += parts[0].text ?? "";
        content += parts[1]?.text ?? "";
      } else {
        content += parts[0]?.text ?? "";
      }
    };

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
            appendPartsText(json[index]?.candidates?.[0]?.content?.parts);
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
        appendPartsText(json[index]?.candidates?.[0]?.content?.parts);
      }

      // Update the last candidate with the concatenated content
      json.at(-1).candidates[0].content.parts = hasThought
        ? [{ text: thought, thought: true }, { text: content }]
        : [{ text: content }];
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

const streamGenerateContentOpenAI = async (apiKey, baseUrl, apiContents, modelConfig, streamKey) => {
  const { modelId } = modelConfig;

  try {
    await chrome.storage.session.remove(streamKey);

    const response = await fetch(buildOpenAIApiUrl(baseUrl, "/chat/completions"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelId,
        messages: apiContents,
        stream: true
      })
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        body: tryParseJson(await response.text())
      };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let content = "";
    let buffer = "";
    let finishReason = "stop";

    while (true) {
      const { value, done } = await reader.read();

      if (value) {
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();

          if (!trimmed || !trimmed.startsWith("data:")) {
            continue;
          }

          const data = trimmed.slice(5).trimStart();

          if (data === "[DONE]") {
            continue;
          }

          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta;

            if (delta?.content) {
              content += delta.content;
              await chrome.storage.session.set({ [streamKey]: content });
            }

            const currentFinishReason = json.choices?.[0]?.finish_reason;
            if (currentFinishReason) {
              finishReason = currentFinishReason;
            }
          } catch {
            // Skip unparseable lines
          }
        }
      }

      if (done) {
        break;
      }
    }

    return {
      ok: true,
      status: 200,
      body: {
        choices: [{ finish_reason: finishReason, message: { content } }],
        model: modelId
      }
    };
  } catch (error) {
    return {
      ok: false,
      status: 1000,
      body: { error: { message: error.stack } }
    };
  }
};

const streamGenerateContentWithFallback = async (apiKey, apiContents, modelConfigs, streamKey, systemInstruction) => {
  let response = {
    ok: false,
    status: 1001,
    body: { error: { message: "No models available." } }
  };

  for (const modelConfig of modelConfigs) {
    response = await streamGenerateContentGemini(apiKey, apiContents, modelConfig, streamKey, systemInstruction);

    if (response.ok || response.status !== 429) {
      break;
    }
  }

  return response;
};

export const streamGenerateContent = async (apiKey, apiContents, modelConfigs, streamKey, apiProvider, openaiBaseUrl) => {
  if (apiProvider === "openai") {
    const openaiContents = convertToOpenAI(apiContents);
    return await streamGenerateContentOpenAI(apiKey, openaiBaseUrl, openaiContents, modelConfigs[0], streamKey);
  }
  const { systemInstruction, contents } = extractSystemInstruction(apiContents);
  return await streamGenerateContentWithFallback(apiKey, contents, modelConfigs, streamKey, systemInstruction);
};

export const getResponseContent = (response, hasApiKey, apiProvider = "gemini") => {
  let responseContent = "";

  if (response.ok) {
    if (apiProvider === "openai") {
      const choice = response.body.choices?.[0];

      if (choice?.finish_reason && choice.finish_reason !== "stop") {
        responseContent = `${chrome.i18n.getMessage("response_response_blocked")} Reason: ${choice.finish_reason}`;
      } else if (choice?.message?.content) {
        responseContent = choice.message.content;
      } else {
        responseContent = chrome.i18n.getMessage("response_unexpected_response");
      }
    } else {
      if (response.body.promptFeedback?.blockReason) {
        // The prompt was blocked
        responseContent = `${chrome.i18n.getMessage("response_prompt_blocked")} Reason: ${response.body.promptFeedback.blockReason}`;
      } else if (response.body.candidates?.[0].finishReason !== "STOP") {
        // The response was blocked
        responseContent = `${chrome.i18n.getMessage("response_response_blocked")} Reason: ${response.body.candidates[0].finishReason}`;
      } else if (response.body.candidates?.[0].content) {
        // A normal response was returned
        const parts = response.body.candidates[0].content.parts || [];
        const responsePart = parts[0]?.thought === true ? parts[1] : parts[0];
        responseContent = responsePart?.text;
      } else {
        // The expected response was not returned
        responseContent = chrome.i18n.getMessage("response_unexpected_response");
      }
    }
  } else {
    // A response error occurred
    responseContent = `Error: ${response.status}\n\n${response.body.error.message}`;

    if (!hasApiKey) {
      // If the API Key is not set, add a message to prompt the user to set it
      if (apiProvider === "openai") {
        responseContent += `\n\n${chrome.i18n.getMessage("response_no_apikey_openai")}`;
      } else {
        responseContent += `\n\n${chrome.i18n.getMessage("response_no_apikey")}`;
      }
    }
  }

  return responseContent;
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
