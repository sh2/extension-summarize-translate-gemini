import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSourceHeader } from "../../extension/utils.js";
import { createMarkdownTestEnvironment } from "../helpers/dom-markdown.js";

let environment;

const serializeFragment = (fragment) => {
  const container = environment.document.createElement("div");

  container.appendChild(fragment.cloneNode(true));
  return container.innerHTML;
};

beforeEach(async () => {
  environment = await createMarkdownTestEnvironment();
});

afterEach(() => {
  if (environment) {
    environment.restore();
    environment = null;
  }
});

describe("buildSourceHeader", () => {
  it("returns the title and the URL in the plain text and in the fragment", () => {
    const { text, fragment } = buildSourceHeader("Title", "https://example.com/");

    expect(text).toBe("Title\nhttps://example.com/\n\n");

    // The order is fixed so that the copied content matches the saved .txt file.
    expect(Array.from(fragment.childNodes).map((node) => node.tagName)).toEqual(["P", "P"]);

    const title = fragment.querySelector("p strong");

    expect(title.textContent).toBe("Title");

    const anchor = fragment.querySelector("a");

    expect(anchor.textContent).toBe("https://example.com/");
    expect(anchor.getAttribute("href")).toBe("https://example.com/");
    expect(anchor.getAttribute("target")).toBe("_blank");
    expect(anchor.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("returns only the title when there is no URL", () => {
    const { text, fragment } = buildSourceHeader("Title", "");

    expect(text).toBe("Title\n\n");
    expect(fragment.querySelector("p strong")?.textContent).toBe("Title");
    expect(fragment.querySelector("a")).toBeNull();
  });

  it("returns only the URL when there is no title", () => {
    const { text, fragment } = buildSourceHeader("", "https://example.com/");

    expect(text).toBe("https://example.com/\n\n");
    expect(fragment.querySelector("p strong")).toBeNull();
    expect(fragment.querySelector("a")?.getAttribute("href")).toBe("https://example.com/");
  });

  it("returns empty text and no fragment when there is nothing to attribute", () => {
    for (const [title, url] of [["", ""], [null, null], [undefined, undefined]]) {
      const { text, fragment } = buildSourceHeader(title, url);

      expect(text).toBe("");
      expect(fragment).toBeNull();
    }
  });

  it("keeps HTML notation inside a title literal", () => {
    const { fragment } = buildSourceHeader('<b>x</b> & "y"', "");

    expect(fragment.querySelector("b")).toBeNull();
    expect(fragment.querySelector("p strong").textContent).toBe('<b>x</b> & "y"');
    expect(serializeFragment(fragment)).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("carries semantics only, without style or class attributes", () => {
    const { fragment } = buildSourceHeader("Title", "https://example.com/");

    // dir is kept: it is metadata that the paste target needs, not presentation.
    expect(fragment.querySelectorAll("[style]")).toHaveLength(0);
    expect(fragment.querySelectorAll("[class]")).toHaveLength(0);
  });

  it("keeps a non http(s) URL as plain text instead of a link", () => {
    const { text, fragment } = buildSourceHeader("Title", "file:///home/user/note.txt");

    expect(text).toBe("Title\nfile:///home/user/note.txt\n\n");
    expect(fragment.querySelector("a")).toBeNull();
    expect(fragment.querySelectorAll("p")[1].textContent).toBe("file:///home/user/note.txt");
  });

  it("marks both header elements with dir so the wrapper keeps resolving direction from the body", () => {
    const { fragment } = buildSourceHeader("Title", "https://example.com/");

    // Auto directionality resolution ignores an element that has a dir attribute, so the
    // dir="auto" wrapper built by copyContentToClipboard() reads past the header instead
    // of resolving from a Latin title. Without this, an RTL body would be left-aligned.
    expect(Array.from(fragment.children).map((element) => element.getAttribute("dir"))).toEqual(["auto", "auto"]);
  });
});
