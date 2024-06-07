/* globals Readability, marked */

let contentIndex = 0;

const getSelectedText = () => {
  // Return the selected text
  return window.getSelection().toString();
};

const getWholeText = () => {
  // Return the whole text
  const documentClone = document.cloneNode(true);
  const article = new Readability(documentClone).parse();

  if (article) {
    return article.textContent;
  } else {
    console.log("Failed to parse the article. Using document.body.innerText instead.");
    return document.body.innerText;
  }
};

const getCaptions = async (videoUrl, languageCode) => {
  // Return the captions of the YouTube video
  const languageCodeForCaptions = {
    en: "en",
    de: "de",
    es: "es",
    fr: "fr",
    it: "it",
    pt_br: "pt-BR",
    vi: "vi",
    ru: "ru",
    zh_cn: "zh-CN",
    zh_tw: "zh-TW",
    ja: "ja",
    ko: "ko"
  };

  const preferredLanguages = [languageCodeForCaptions[languageCode], "en"];
  const videoResponse = await fetch(videoUrl);
  const videoBody = await videoResponse.text();
  const captionsConfigJson = videoBody.match(/"captions":(.*?),"videoDetails":/s);
  let captions = "";

  if (captionsConfigJson) {
    const captionsConfig = JSON.parse(captionsConfigJson[1]);

    if (captionsConfig?.playerCaptionsTracklistRenderer?.captionTracks) {
      const captionTracks = captionsConfig.playerCaptionsTracklistRenderer.captionTracks;

      const calculateValue = (a) => {
        let value = preferredLanguages.indexOf(a.languageCode);
        value = value === -1 ? 9999 : value;
        value += a.kind === "asr" ? 0.5 : 0;
        return value;
      };

      // Sort the caption tracks by the preferred languages and the kind
      captionTracks.sort((a, b) => {
        const valueA = calculateValue(a);
        const valueB = calculateValue(b);
        return valueA - valueB;
      });

      const captionsUrl = captionTracks[0].baseUrl;
      const captionsResponse = await fetch(captionsUrl);
      const captionsXml = await captionsResponse.text();
      const xmlDocument = new DOMParser().parseFromString(captionsXml, "application/xml");
      const textElements = xmlDocument.getElementsByTagName("text");
      captions = Array.from(textElements).map(element => element.textContent).join("\n");
    } else {
      console.log("No captionTracks found.");
    }
  } else {
    console.log("No captions found.");
  }

  return captions;
};

const getLoadingMessage = (task, taskOption) => {
  let loadingMessage = "";

  if (task === "summarize") {
    if (taskOption === "captions") {
      loadingMessage = chrome.i18n.getMessage("popup_summarizing_captions");
    } else if (taskOption === "image") {
      loadingMessage = chrome.i18n.getMessage("popup_summarizing_image");
    } else {
      loadingMessage = chrome.i18n.getMessage("popup_summarizing");
    }
  } else if (task === "translate") {
    if (taskOption === "captions") {
      loadingMessage = chrome.i18n.getMessage("popup_translating_captions");
    } else if (taskOption === "image") {
      loadingMessage = chrome.i18n.getMessage("popup_translating_image");
    } else {
      loadingMessage = chrome.i18n.getMessage("popup_translating");
    }
  } else {
    loadingMessage = chrome.i18n.getMessage("popup_processing");
  }

  return loadingMessage;
};

const displayLoadingMessage = (loadingMessage) => {
  const status = document.getElementById("status");

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

const main = async () => {
  let displayIntervalId = 0;
  let content = "";
  contentIndex = (await chrome.storage.session.get({ contentIndex: -1 })).contentIndex;
  contentIndex = (contentIndex + 1) % 10;
  await chrome.storage.session.set({ contentIndex: contentIndex });

  try {
    const languageModel = document.getElementById("languageModel").value;
    const languageCode = document.getElementById("languageCode").value;
    let userPrompt = "";
    let userPromptChunks = [];
    let task = "";
    let taskOption = "";

    document.getElementById("content").textContent = "";
    document.getElementById("status").textContent = "";
    document.getElementById("run").disabled = true;
    document.getElementById("languageModel").disabled = true;
    document.getElementById("languageCode").disabled = true;
    document.getElementById("results").disabled = true;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Get the selected text
    userPrompt = (await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: getSelectedText
    }))[0].result;

    if (userPrompt) {
      task = (await chrome.storage.local.get({ textAction: "translate" })).textAction;
      taskOption = "";
    } else {
      // If no text is selected, get the whole text of the page
      task = (await chrome.storage.local.get({ noTextAction: "summarize" })).noTextAction;

      if (tab.url.startsWith("https://www.youtube.com/watch?v=")) {
        // If the page is a YouTube video, get the captions instead of the whole text
        taskOption = "captions";

        userPrompt = (await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: getCaptions,
          args: [tab.url, languageCode]
        }))[0].result;
      }

      if (!userPrompt) {
        // Get the main text of the page using Readability.js
        taskOption = "";

        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["lib/Readability.min.js"]
        });

        userPrompt = (await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: getWholeText
        }))[0].result;
      }

      if (!userPrompt) {
        // If the whole text is empty, get the visible tab as an image
        taskOption = "image";
        userPrompt = await (chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg" }));
      }
    }

    displayIntervalId = setInterval(displayLoadingMessage, 500, getLoadingMessage(task, taskOption));

    // Split the user prompt
    if (taskOption === "image") {
      // If the user prompt is an image, do not split it
      userPromptChunks = [userPrompt];
    }
    else {
      userPromptChunks = await chrome.runtime.sendMessage({
        message: "chunk", task: task, taskOption: taskOption, userPrompt: userPrompt, languageModel: languageModel
      });

      console.log(userPromptChunks);
    }

    for (const userPromptChunk of userPromptChunks) {
      // Generate content
      const response = await chrome.runtime.sendMessage({
        message: "generate",
        task: task,
        taskOption: taskOption,
        userPrompt: userPromptChunk,
        languageModel: languageModel,
        languageCode: languageCode
      });

      console.log(response);

      if (response.ok) {
        if (response.body.promptFeedback?.blockReason) {
          // The prompt was blocked
          content = `${chrome.i18n.getMessage("popup_prompt_blocked")} ` +
            `Reason: ${response.body.promptFeedback.blockReason}`;
          break;
        } else if (response.body.candidates?.[0].finishReason !== "STOP") {
          // The response was blocked
          content = `${chrome.i18n.getMessage("popup_response_blocked")} ` +
            `Reason: ${response.body.candidates[0].finishReason}`;
          break;
        } else if (response.body.candidates?.[0].content) {
          // A normal response was returned
          content += `${response.body.candidates[0].content.parts[0].text}\n\n`;
          const div = document.createElement("div");
          div.textContent = content;
          document.getElementById("content").innerHTML = marked.parse(div.innerHTML);

          // Scroll to the bottom of the page
          window.scrollTo(0, document.body.scrollHeight);
        } else {
          // The expected response was not returned
          content = chrome.i18n.getMessage("popup_unexpected_response");
          break;
        }
      } else {
        // A response error occurred
        content = `Error: ${response.status}\n\n${response.body.error.message}`;
        break;
      }
    }
  } catch (error) {
    content = chrome.i18n.getMessage("popup_miscellaneous_error");
    console.log(error);
  } finally {
    if (displayIntervalId) {
      clearInterval(displayIntervalId);
    }

    document.getElementById("status").textContent = "";
    document.getElementById("run").disabled = false;
    document.getElementById("languageModel").disabled = false;
    document.getElementById("languageCode").disabled = false;
    document.getElementById("results").disabled = false;

    // Convert the content from Markdown to HTML
    const div = document.createElement("div");
    div.textContent = content;
    document.getElementById("content").innerHTML = marked.parse(div.innerHTML);

    // Save the content to the session storage
    await chrome.storage.session.set({ [`c_${contentIndex}`]: content });
  }
};

const initialize = async () => {
  // Disable links when converting from Markdown to HTML
  marked.use({ renderer: { link: (_href, _title, text) => text } });

  // Set the text of elements with the data-i18n attribute
  document.querySelectorAll("[data-i18n]").forEach(element => {
    element.textContent = chrome.i18n.getMessage(element.getAttribute("data-i18n"));
  });

  // Restore the language code from the local storage
  const { languageModel, languageCode } = await chrome.storage.local.get({ languageModel: "1.5-flash", languageCode: "en" });
  document.getElementById("languageModel").value = languageModel;
  document.getElementById("languageCode").value = languageCode;

  main();
};

document.addEventListener("DOMContentLoaded", initialize);
document.getElementById("run").addEventListener("click", main);

document.getElementById("results").addEventListener("click", async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL(`results.html?i=${contentIndex}`) });
});

document.getElementById("options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
