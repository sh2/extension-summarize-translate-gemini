import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { convertMarkdownToHtml } from "../../extension/utils.js";
import { createMarkdownTestEnvironment } from "../helpers/dom-markdown.js";

let environment;

const renderMarkdown = (content, breaks = false, links = true) => {
  const html = convertMarkdownToHtml(content, breaks, links);
  const container = environment.parseHtmlFragment(html);

  return { html, container };
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

const getLiveEventHandlerAttributes = (container) => {
  return Array.from(container.querySelectorAll("*")).flatMap((element) => {
    return element.getAttributeNames().filter((attributeName) => attributeName.startsWith("on"));
  });
};

describe("convertMarkdownToHtml", () => {
  it("renders standard markdown and preserves code text", () => {
    const markdown = [
      "# Title",
      "",
      "- first",
      "- second",
      "",
      "Inline `<tag>&value` sample.",
      "",
      "```",
      "<tag>&value",
      "```"
    ].join("\n");

    const { container } = renderMarkdown(markdown);
    const heading = container.querySelector("h1");
    const listItems = Array.from(container.querySelectorAll("li"));
    const codeBlocks = container.querySelectorAll("code");

    expect(heading?.textContent).toBe("Title");
    expect(listItems.map((item) => item.textContent)).toEqual(["first", "second"]);
    expect(codeBlocks).toHaveLength(2);
    expect(codeBlocks[0].textContent).toBe("<tag>&value");
    expect(codeBlocks[1].textContent).toBe("<tag>&value\n");
  });

  it("keeps the current breaks contract for representative line breaks", () => {
    const withoutBreaks = renderMarkdown("line1\nline2", false).container.querySelector("p");
    const withBreaks = renderMarkdown("line1\nline2", true).container.querySelector("p");

    expect(withoutBreaks?.innerHTML).toBe("line1\nline2");
    expect(withBreaks?.innerHTML).toBe("line1<br>line2");
  });

  it("does not keep script tags as live DOM elements", () => {
    const { html, container } = renderMarkdown("before <script>alert(1)</script> after");

    expect(container.querySelector("script")).toBeNull();
    expect(html).not.toContain("<script>");
    expect(container.textContent).toContain("<script>alert(1)</script>");
  });

  it("does not keep event handler attributes as live DOM", () => {
    const { container } = renderMarkdown("before <img src=\"x\" onerror=\"alert(1)\"> and <div onclick=\"alert(1)\">tap</div> after");

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("div")).toBeNull();
    expect(getLiveEventHandlerAttributes(container)).toEqual([]);
    expect(container.textContent).toContain("<img src=\"x\" onerror=\"alert(1)\">");
    expect(container.textContent).toContain("<div onclick=\"alert(1)\">tap</div>");
  });

  it("removes javascript links while preserving safe link attributes", () => {
    const { container } = renderMarkdown("[bad](javascript:alert(1)) [ok](https://example.com)");
    const anchors = container.querySelectorAll("a");

    expect(anchors).toHaveLength(2);
    expect(anchors[0].hasAttribute("href")).toBe(false);
    expect(anchors[1].getAttribute("href")).toBe("https://example.com");
    expect(anchors[1].getAttribute("target")).toBe("_blank");
    expect(anchors[1].getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("does not materialize raw SVG payloads and reflects current data-url handling", () => {
    const { container } = renderMarkdown("<svg onload=\"alert(1)\"></svg> [bad](data:text/html,alert) ![img](data:text/html,alert)");
    const anchors = container.querySelectorAll("a");
    const images = container.querySelectorAll("img");

    expect(container.querySelector("svg")).toBeNull();
    expect(getLiveEventHandlerAttributes(container)).toEqual([]);
    expect(anchors).toHaveLength(1);
    expect(anchors[0].hasAttribute("href")).toBe(false);
    expect(images).toHaveLength(1);
    expect(images[0].getAttribute("src")).toBe("data:text/html,alert");
  });

  it("keeps only link text when links are disabled", () => {
    const { container } = renderMarkdown("[label](https://example.com)", false, false);

    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent?.trim()).toBe("label");
    expect(container.textContent).not.toContain("https://example.com");
  });

  it("restores code characters without turning them into HTML", () => {
    const markdown = [
      "Inline `<tag>&value` sample.",
      "",
      "```",
      "<tag>&value",
      "```"
    ].join("\n");

    const { container } = renderMarkdown(markdown);
    const codeBlocks = container.querySelectorAll("code");

    expect(codeBlocks[0].textContent).toBe("<tag>&value");
    expect(codeBlocks[0].querySelector("tag")).toBeNull();
    expect(codeBlocks[1].textContent).toBe("<tag>&value\n");
    expect(codeBlocks[1].querySelector("tag")).toBeNull();
    expect(container.querySelector("p")?.innerHTML).toContain("&amp;value");
  });
});