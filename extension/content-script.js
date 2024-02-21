chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.message === "getSelectedText") {
    // Return the selected text
    sendResponse(window.getSelection().toString());
  } else if (request.message === "getWholeText") {
    // Return the whole text
    const documentClone = document.cloneNode(true);
    const article = new Readability(documentClone).parse();

    if (article) {
      sendResponse(article.textContent);
    } else {
      console.log("Failed to parse the article. Using document.body.innerText instead.");
      sendResponse(document.body.innerText);
    }
  }

  return true;
});
