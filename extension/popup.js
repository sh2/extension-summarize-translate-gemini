let contentIndex = 0;

const getSelectedText = () => {
  // Return the selected text
  return window.getSelection().toString();
}

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
}

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
    let userPrompt = "";
    let userPromptChunks = [];
    let task = "";
    let loadingMessage = "";

    document.getElementById("content").textContent = "";
    document.getElementById("status").textContent = "";
    document.getElementById("run").disabled = true;
    document.getElementById("results").disabled = true;
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Get the selected text
    if (userPrompt = (await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: getSelectedText }))[0].result) {
      task = "translate";
      loadingMessage = chrome.i18n.getMessage("popup_translating");
    } else {
      // If no text is selected, get the whole text of the page
      task = "summarize";
      loadingMessage = chrome.i18n.getMessage("popup_summarizing");
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["lib/Readability.min.js"] });
      userPrompt = (await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: getWholeText }))[0].result;
    }

    displayIntervalId = setInterval(displayLoadingMessage, 500, loadingMessage);

    // Split the user prompt
    userPromptChunks = await chrome.runtime.sendMessage({ message: "chunk", task: task, userPrompt: userPrompt });
    console.log(userPromptChunks);

    for (const userPromptChunk of userPromptChunks) {
      // Generate content
      const response = await chrome.runtime.sendMessage({ message: "generate", task: task, userPrompt: userPromptChunk });
      console.log(response);

      if (response.ok) {
        if (response.body.promptFeedback.blockReason) {
          // The prompt was blocked
          content = `${chrome.i18n.getMessage("popup_prompt_blocked")} Reason: ${response.body.promptFeedback.blockReason}`;
          break;
        } else if (response.body.candidates && response.body.candidates[0].finishReason !== "STOP") {
          // The response was blocked
          content = `${chrome.i18n.getMessage("popup_response_blocked")} Reason: ${response.body.candidates[0].finishReason}`;
          break;
        } else if (response.body.candidates[0].content) {
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
    document.getElementById("results").disabled = false;

    // Convert the content from Markdown to HTML
    const div = document.createElement("div");
    div.textContent = content;
    document.getElementById("content").innerHTML = marked.parse(div.innerHTML);

    // Save the content to the session storage
    await chrome.storage.session.set({ [`c_${contentIndex}`]: content });
  }
};

const initialize = () => {
  // Disable links when converting from Markdown to HTML
  marked.use({ renderer: { link: (_href, _title, text) => text } });

  // Set the text of elements with the data-i18n attribute
  document.querySelectorAll("[data-i18n]").forEach(element => {
    element.textContent = chrome.i18n.getMessage(element.getAttribute("data-i18n"));
  });

  main();
}

document.addEventListener("DOMContentLoaded", initialize);
document.getElementById("run").addEventListener("click", main);

document.getElementById("results").addEventListener("click", async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL(`results.html?i=${contentIndex}`) });
});

document.getElementById("options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
