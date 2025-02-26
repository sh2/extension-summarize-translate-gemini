const safetySettings = [{
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

export const adjustLayoutForScreenSize = () => {
  // Add the narrow class if the screen width is narrow
  if (document.getElementById("header").clientWidth < 640) {
    document.body.classList.add("narrow");
  } else {
    document.body.classList.remove("narrow");
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

export const getModelId = (languageModel, userModelId) => {
  const modelMappings = {
    "2.0-flash": "gemini-2.0-flash",
    "2.0-flash-lite": "gemini-2.0-flash-lite",
    "1.5-pro": "gemini-1.5-pro",
    "1.5-flash": "gemini-1.5-flash",
    "1.5-flash-8b": "gemini-1.5-flash-8b",
    "2.0-pro-exp-02-05": "gemini-2.0-pro-exp-02-05"
  };

  if (languageModel === "zz") {
    return userModelId;
  } else {
    return modelMappings[languageModel];
  }
};

export const generateContent = async (apiKey, modelId, apiContents) => {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        contents: apiContents,
        safetySettings: safetySettings
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

export const streamGenerateContent = async (apiKey, modelId, apiContents) => {
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
        safetySettings: safetySettings
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
