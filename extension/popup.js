// Disable links when converting from Markdown to HTML
marked.use({ renderer: { link: (_href, _title, text) => text } });

const loadingMessage = {
  summarize: "Summarizing",
  translate: "Translating"
};

const displayLoadingMessage = (loadingMessage) => {
  const status = document.getElementById("status");

  switch (status.textContent) {
    case `${loadingMessage}…`:
      status.textContent = `${loadingMessage}……`;
      break;
    case `${loadingMessage}……`:
      status.textContent = `${loadingMessage}………`;
      break;
    default:
      status.textContent = `${loadingMessage}…`;
  }
};

const main = async () => {
  let displayIntervalId = 0;
  let content = "";

  try {
    let userPrompt = "";
    let userPromptChunks = [];
    let task = "";

    document.getElementById("content").textContent = "";
    document.getElementById("status").textContent = "";
    document.getElementById("run").disabled = true;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Get the selected text
    if (userPrompt = await chrome.tabs.sendMessage(tab.id, { message: "getSelectedText" })) {
      task = "translate";
    } else {
      // If no text is selected, get the whole text of the page
      task = "summarize";
      userPrompt = await chrome.tabs.sendMessage(tab.id, { message: "getWholeText" });
    }

    displayIntervalId = setInterval(displayLoadingMessage, 500, loadingMessage[task]);

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
          content = `The prompt was blocked. Reason: ${response.body.promptFeedback.blockReason}`;
          break;
        } else if (response.body.candidates && response.body.candidates[0].finishReason !== "STOP") {
          // The response was blocked
          content = `The response was blocked. Reason: ${response.body.candidates[0].finishReason}`;
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
          content = "An unknown error occurred. Please check the console log.";
          break;
        }
      } else {
        // An error occurred
        content = `Error: ${response.status}\n\n${response.body.error.message}`;
        break;
      }
    }
  } catch (error) {
    content = "This page cannot be summarized or translated.";
    console.log(error);
  } finally {
    if (displayIntervalId) {
      clearInterval(displayIntervalId);
    }

    document.getElementById("status").textContent = "";
    document.getElementById("run").disabled = false;
    const div = document.createElement("div");
    div.textContent = content;
    document.getElementById("content").innerHTML = marked.parse(div.innerHTML);
  }
}

document.addEventListener("DOMContentLoaded", main);
document.getElementById("run").addEventListener("click", main)
document.getElementById("options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
