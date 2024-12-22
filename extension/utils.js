const tryParseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text } };
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

export const getModelId = (languageModel) => {
  const modelMappings = {
    "exp-1121": "gemini-exp-1121",
    "exp-1206": "gemini-exp-1206",
    "2.0-flash-exp": "gemini-2.0-flash-exp",
    "1.5-pro-latest": "gemini-1.5-pro-latest",
    "1.5-flash-latest": "gemini-1.5-flash-latest",
    "1.5-flash-8b-latest": "gemini-1.5-flash-8b-latest",
    "1.5-pro": "gemini-1.5-pro",
    "1.5-flash": "gemini-1.5-flash",
    "1.5-flash-8b": "gemini-1.5-flash-8b"
  };

  return modelMappings[languageModel];
};

export const generateContent = async (modelId, apiKey, apiContents) => {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: apiContents,
        safetySettings: [{
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
        }]
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
