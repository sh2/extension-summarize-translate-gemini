chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.message === "getSelectedText") {
    // Return the selected text
    sendResponse(window.getSelection().toString());
  } else if (request.message === "getWholeText") {
    // Return the whole text
    const documentClone = document.cloneNode(true);
    const article = new Readability(documentClone).parse();

    if (article.textContent) {
      sendResponse(article.textContent);
    } else {
      console.log("Article is empty, so fallback to send document.body.innerText.")
      sendResponse(document.body.innerText);
    }
  }

  return true;
});
