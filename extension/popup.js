/* globals DOMPurify, Readability, marked */

let contentIndex = 0;

const checkNarrowScreen = () => {
  // Add the narrow class if the screen width is narrow
  if (document.getElementById("header").clientWidth < 640) {
    document.body.classList.add("narrow");
  } else {
    document.body.classList.remove("narrow");
  }
};

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
    ar: "ar",
    hi: "hi",
    bn: "bn",
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

const extractTaskInformation = async (languageCode) => {
  let actionType = "";
  let mediaType = "";
  let taskInput = "";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Get the selected text
  taskInput = (await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: getSelectedText
  }))[0].result;

  if (taskInput) {
    actionType = (await chrome.storage.local.get({ textAction: "translate" })).textAction;
    mediaType = "text";
  } else {
    // If no text is selected, get the whole text of the page
    actionType = (await chrome.storage.local.get({ noTextAction: "summarize" })).noTextAction;

    if (tab.url.startsWith("https://www.youtube.com/watch?v=") || tab.url.startsWith("https://m.youtube.com/watch?v=")) {
      // If the page is a YouTube video, get the captions instead of the whole text
      mediaType = "captions";

      taskInput = (await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: getCaptions,
        args: [tab.url, languageCode]
      }))[0].result;
    }

    if (!taskInput) {
      // Get the main text of the page using Readability.js
      mediaType = "text";

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["lib/Readability.min.js"]
      });

      taskInput = (await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: getWholeText
      }))[0].result;
    }

    if (!taskInput) {
      // If the whole text is empty, get the visible tab as an image
      mediaType = "image";
      taskInput = await (chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg" }));
    }
  }

  return { actionType, mediaType, taskInput };
};

const getLoadingMessage = (actionType, mediaType) => {
  let loadingMessage = "";

  if (actionType === "summarize") {
    if (mediaType === "captions") {
      loadingMessage = chrome.i18n.getMessage("popup_summarizing_captions");
    } else if (mediaType === "image") {
      loadingMessage = chrome.i18n.getMessage("popup_summarizing_image");
    } else {
      loadingMessage = chrome.i18n.getMessage("popup_summarizing");
    }
  } else if (actionType === "translate") {
    if (mediaType === "captions") {
      loadingMessage = chrome.i18n.getMessage("popup_translating_captions");
    } else if (mediaType === "image") {
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

const main = async (useCache) => {
  let displayIntervalId = 0;
  let content = "";
  contentIndex = (await chrome.storage.session.get({ contentIndex: -1 })).contentIndex;
  contentIndex = (contentIndex + 1) % 10;
  await chrome.storage.session.set({ contentIndex: contentIndex });

  try {
    const languageModel = document.getElementById("languageModel").value;
    const languageCode = document.getElementById("languageCode").value;
    let taskInputChunks = [];

    document.getElementById("content").textContent = "";
    document.getElementById("status").textContent = "";
    document.getElementById("run").disabled = true;
    document.getElementById("languageModel").disabled = true;
    document.getElementById("languageCode").disabled = true;
    document.getElementById("results").disabled = true;

    const { actionType, mediaType, taskInput } = await extractTaskInformation(languageCode);
    displayIntervalId = setInterval(displayLoadingMessage, 500, getLoadingMessage(actionType, mediaType));

    // Split the task input
    if (mediaType === "image") {
      // If the task input is an image, do not split it
      taskInputChunks = [taskInput];
    } else {
      taskInputChunks = await chrome.runtime.sendMessage({
        message: "chunk",
        actionType: actionType,
        mediaType: mediaType,
        taskInput: taskInput,
        languageModel: languageModel
      });

      console.log(taskInputChunks);
    }

    for (const taskInputChunk of taskInputChunks) {
      const taskCache = (await chrome.storage.session.get({ taskCache: "" })).taskCache;
      let response = {};

      if (useCache && taskCache === JSON.stringify({
        actionType,
        mediaType,
        taskInput: taskInputChunk,
        languageModel,
        languageCode
      })) {
        // Use the cached response
        response = (await chrome.storage.session.get({ responseCache: {} })).responseCache;
      } else {
        // Generate content
        response = await chrome.runtime.sendMessage({
          message: "generate",
          actionType: actionType,
          mediaType: mediaType,
          taskInput: taskInputChunk,
          languageModel: languageModel,
          languageCode: languageCode
        });
      }

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
          document.getElementById("content").innerHTML = DOMPurify.sanitize(marked.parse(div.innerHTML));

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
    console.error(error);
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
    document.getElementById("content").innerHTML = DOMPurify.sanitize(marked.parse(div.innerHTML));

    // Save the content to the session storage
    await chrome.storage.session.set({ [`c_${contentIndex}`]: content });
  }
};

const initialize = async () => {
  // Check if the screen is narrow
  checkNarrowScreen();

  // Disable links when converting from Markdown to HTML
  marked.use({ renderer: { link: ({ text }) => text } });

  // Set the text direction of the body
  document.body.setAttribute("dir", chrome.i18n.getMessage("@@bidi_dir"));

  // Set the text of elements with the data-i18n attribute
  document.querySelectorAll("[data-i18n]").forEach(element => {
    element.textContent = chrome.i18n.getMessage(element.getAttribute("data-i18n"));
  });

  // Restore the language code from the local storage
  const { languageModel, languageCode } = await chrome.storage.local.get({ languageModel: "1.5-flash", languageCode: "en" });
  document.getElementById("languageModel").value = languageModel;
  document.getElementById("languageCode").value = languageCode;

  // Set the default language model if the language model is not set
  if (!document.getElementById("languageModel").value) {
    document.getElementById("languageModel").value = "1.5-flash";
  }

  main(true);
};

document.addEventListener("DOMContentLoaded", initialize);

document.getElementById("run").addEventListener("click", () => {
  main(false);
});

document.getElementById("results").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL(`results.html?i=${contentIndex}`) }, () => {
    window.close();
  });
});

document.getElementById("options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage(() => {
    window.close();
  });
});

window.addEventListener("resize", checkNarrowScreen);
