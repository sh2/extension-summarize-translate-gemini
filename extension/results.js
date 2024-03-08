const initialize = async () => {
    // Disable links when converting from Markdown to HTML
    marked.use({ renderer: { link: (_href, _title, text) => text } });

    // Set the text of elements with the data-i18n attribute
    document.querySelectorAll("[data-i18n]").forEach(element => {
        element.textContent = chrome.i18n.getMessage(element.getAttribute("data-i18n"));
    });

    // Restore the content from the session storage
    const urlParams = new URLSearchParams(window.location.search);
    const contentIndex = urlParams.get("i");
    const content = (await chrome.storage.session.get({ [`c_${contentIndex}`]: "" }))[`c_${contentIndex}`];

    // Convert the content from Markdown to HTML
    const div = document.createElement("div");
    div.textContent = content;
    document.getElementById("content").innerHTML = marked.parse(div.innerHTML);
}

document.addEventListener("DOMContentLoaded", initialize);
