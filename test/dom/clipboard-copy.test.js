import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyContentToClipboard } from "../../extension/utils.js";
import { createMarkdownTestEnvironment } from "../helpers/dom-markdown.js";

let environment;
let clipboardWrite;
let clipboardWriteText;
let clipboardItems;

// Minimal stand-in for the browser ClipboardItem: it only records the payload so
// that the test can inspect the text/html and text/plain blobs.
class ClipboardItemStub {
  constructor(record) {
    this.record = record;
    clipboardItems.push(this);
  }
}

const createRoot = (tagName, html) => {
  const root = environment.document.createElement(tagName);

  root.innerHTML = html;
  return root;
};

const getCopiedHtml = async () => {
  expect(clipboardItems).toHaveLength(1);
  return clipboardItems[0].record["text/html"].text();
};

const getCopiedText = async () => {
  expect(clipboardItems).toHaveLength(1);
  return clipboardItems[0].record["text/plain"].text();
};

beforeEach(async () => {
  environment = await createMarkdownTestEnvironment();
  clipboardItems = [];
  clipboardWrite = vi.fn(() => Promise.resolve());
  clipboardWriteText = vi.fn(() => Promise.resolve());

  vi.stubGlobal("navigator", {
    clipboard: {
      write: clipboardWrite,
      writeText: clipboardWriteText
    }
  });

  vi.stubGlobal("ClipboardItem", ClipboardItemStub);
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();

  if (environment) {
    environment.restore();
    environment = null;
  }
});

describe("copyContentToClipboard", () => {
  it("writes text/html and text/plain in a single clipboard item", async () => {
    const contentRoot = createRoot("p", "<h1>Title</h1><p><strong>bold</strong> text</p>");
    const conversationRoot = createRoot("div", "<ul><li>first</li></ul>");

    await copyContentToClipboard("plain body\n\n", contentRoot, conversationRoot);

    expect(clipboardWrite).toHaveBeenCalledTimes(1);
    expect(clipboardWriteText).not.toHaveBeenCalled();

    const html = await getCopiedHtml();
    const text = await getCopiedText();

    expect(text).toBe("plain body\n\n");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<ul><li>first</li></ul>");
  });

  it("wraps the fragment in a dir attribute and keeps block structure", async () => {
    const contentRoot = createRoot("p", [
      "<h1>Title</h1>",
      "<p><strong>bold</strong> text</p>",
      "<ul><li>first</li><li>second</li></ul>",
      "<pre><code>const value = 1;</code></pre>"
    ].join(""));

    await copyContentToClipboard("plain body\n\n", contentRoot);

    const html = await getCopiedHtml();

    expect(html.startsWith('<div dir="auto">')).toBe(true);

    const container = environment.parseHtmlFragment(html);

    expect(container.querySelector("h1")?.textContent).toBe("Title");
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(Array.from(container.querySelectorAll("li")).map((item) => item.textContent)).toEqual(["first", "second"]);
    expect(container.querySelector("pre code")?.textContent).toBe("const value = 1;");
  });

  it("drops attachment previews including their wrapper but keeps remote images", async () => {
    const contentRoot = createRoot("div", [
      "<p>Text</p>",
      '<div class="results-image-preview conversation-image-preview"><img src="data:image/jpeg;base64,AAAA" alt=""></div>',
      '<p><img src="https://example.com/image.png" alt="remote"></p>'
    ].join(""));

    await copyContentToClipboard("plain body\n\n", contentRoot);

    const container = environment.parseHtmlFragment(await getCopiedHtml());

    expect(container.querySelector('img[src^="data:"]')).toBeNull();
    expect(container.querySelector(".results-image-preview")).toBeNull();

    // Only the dir="auto" wrapper is left: the preview wrapper did not leave an empty div behind.
    expect(container.querySelectorAll("div")).toHaveLength(1);

    const remoteImage = container.querySelector('img[src="https://example.com/image.png"]');

    expect(remoteImage).not.toBeNull();
    expect(remoteImage?.getAttribute("alt")).toBe("remote");
  });

  it("does not carry definition-dependent styles such as var() and rem", async () => {
    const conversationRoot = createRoot("div", [
      '<div class="conversation-question" dir="auto"><div><p>Question</p></div></div>',
      "<div><p>Answer</p></div>"
    ].join(""));

    await copyContentToClipboard("plain body\n\n", conversationRoot);

    const html = await getCopiedHtml();

    // The paste target has neither the extension stylesheet nor its root font size, so
    // such values would be dropped there anyway.
    expect(html).not.toContain("var(");
    expect(html).not.toContain("rem");

    // Class names are carried along, but they are inert outside the results page.
    expect(environment.parseHtmlFragment(html).querySelector(".conversation-question")).not.toBeNull();
  });

  it("leaves the source DOM untouched", async () => {
    const contentHtml = "<h1>Title</h1><p><strong>bold</strong> text</p>";
    const contentRoot = createRoot("p", contentHtml);
    const conversationRoot = createRoot("div", "<ul><li>first</li></ul>");

    await copyContentToClipboard("plain body\n\n", contentRoot, conversationRoot);

    expect(contentRoot.innerHTML).toBe(contentHtml);
    expect(conversationRoot.innerHTML).toBe("<ul><li>first</li></ul>");
  });

  it("copies the plain text exactly as provided", async () => {
    const contentRoot = createRoot("p", "<p><strong>bold</strong> text</p>");
    const clipboardContent = "**bold** text\n\nfollow-up question\n\n";

    await copyContentToClipboard(clipboardContent, contentRoot);

    expect(await getCopiedText()).toBe(clipboardContent);
  });

  it("falls back to text only when there are no usable roots", async () => {
    const emptyRoot = createRoot("div", "");

    await copyContentToClipboard("plain body\n\n", null, undefined, emptyRoot);

    expect(clipboardWrite).not.toHaveBeenCalled();
    expect(clipboardWriteText).toHaveBeenCalledTimes(1);
    expect(clipboardWriteText).toHaveBeenCalledWith("plain body\n\n");
    expect(clipboardItems).toHaveLength(0);
  });

  it("falls back to text only when ClipboardItem is unavailable", async () => {
    vi.stubGlobal("ClipboardItem", undefined);

    const contentRoot = createRoot("p", "<h1>Title</h1>");

    await copyContentToClipboard("plain body\n\n", contentRoot);

    expect(clipboardWrite).not.toHaveBeenCalled();
    expect(clipboardWriteText).toHaveBeenCalledWith("plain body\n\n");
  });

  it("falls back to text only when the HTML write is rejected", async () => {
    const writeError = new Error("NotAllowedError");
    clipboardWrite.mockRejectedValueOnce(writeError);

    const contentRoot = createRoot("p", "<h1>Title</h1>");

    await expect(copyContentToClipboard("plain body\n\n", contentRoot)).resolves.toBeUndefined();

    expect(clipboardWrite).toHaveBeenCalledTimes(1);
    expect(clipboardWriteText).toHaveBeenCalledTimes(1);
    expect(clipboardWriteText).toHaveBeenCalledWith("plain body\n\n");
  });

  it("propagates an unavailable clipboard to the caller", async () => {
    vi.unstubAllGlobals();

    const contentRoot = createRoot("p", "<h1>Title</h1>");

    await expect(copyContentToClipboard("plain body\n\n", contentRoot)).rejects.toThrow(TypeError);
  });
});
