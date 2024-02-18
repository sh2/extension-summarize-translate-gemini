const displayLoadingMessage = (message) => {
  const content = document.getElementById("content");

  switch (content.textContent) {
    case `${message}.`:
      content.textContent = `${message}..`;
      break;
    case `${message}..`:
      content.textContent = `${message}...`;
      break;
    default:
      content.textContent = `${message}.`;
  }
}

const main = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let displayIntervalId = null;
  let content = "";

  try {
    document.getElementById("run").disabled = true;
    let userPrompt = "";
    let response = {};

    if (userPrompt = await chrome.tabs.sendMessage(tab.id, { message: "getSelectedText" })) {
      // Translate the selected text
      displayIntervalId = setInterval(displayLoadingMessage, 500, "Translating");
      response = await chrome.runtime.sendMessage({ message: "translate", userPrompt: userPrompt });
    } else {
      // Summarize the whole text
      userPrompt = await chrome.tabs.sendMessage(tab.id, { message: "getWholeText" });
      displayIntervalId = setInterval(displayLoadingMessage, 500, "Summarizing");
      response = await chrome.runtime.sendMessage({ message: "summarize", userPrompt: userPrompt });
    }

    if (response.ok) {
      if (response.body.promptFeedback.blockReason) {
        // The prompt was blocked.
        content = `The prompt was blocked. Reason: ${response.body.promptFeedback.blockReason}`;
      } else if (response.body.candidates && response.body.candidates[0].finishReason !== "STOP") {
        // The response was blocked.
        content = `The response was blocked. Reason: ${response.body.candidates[0].finishReason}`;
      } else if (response.body.candidates[0].content) {
        // A normal response was returned.
        content = response.body.candidates[0].content.parts[0].text;
      } else {
        // The expected response was not returned.
        content = "An unknown error occurred. Please check the console log.";
      }
    } else {
      // An error occurred.
      content = `Error: ${response.status}\n\n${response.body.error.message}`;
    }

    console.log(`${response.status}\n${JSON.stringify(response.body, null, 2)}`);
  } catch (error) {
    content = "This page cannot be summarized or translated.";
    console.log(error);
  } finally {
    if (displayIntervalId) {
      clearInterval(displayIntervalId);
    }

    document.getElementById("run").disabled = false;
  }

  // When converting from Markdown, disable links
  marked.use({ renderer: { link: (_href, _title, text) => text } });

  const div = document.createElement("div");
  div.textContent = content;
  document.getElementById("content").innerHTML = marked.parse(div.innerHTML);
}

document.addEventListener("DOMContentLoaded", main);
document.getElementById("run").addEventListener("click", main)
document.getElementById("options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
