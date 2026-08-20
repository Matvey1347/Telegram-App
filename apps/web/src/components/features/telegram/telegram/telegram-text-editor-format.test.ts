import { describe, expect, it } from "vitest";
import {
  editorHtmlToTelegramMarkup,
  telegramMarkupToEditorHtml,
} from "./telegram-text-editor-format";

describe("telegram-text-editor-format", () => {
  it("renders stored markup as formatted editor html", () => {
    expect(
      telegramMarkupToEditorHtml(
        "**Bold** __Italic__ ++Underlined++ ~~Gone~~ ||Hidden||",
      ),
    ).toContain("<strong>Bold</strong>");
    expect(
      telegramMarkupToEditorHtml(
        "**Bold** __Italic__ ++Underlined++ ~~Gone~~ ||Hidden||",
      ),
    ).toContain('<span data-telegram-spoiler="true">Hidden</span>');
  });

  it("serializes formatted editor html back to telegram markup", () => {
    const html = [
      "<div><strong>Bold</strong> <em>Italic</em> <u>Underlined</u></div>",
      '<div><a href="https://example.com/" target="_blank" rel="noreferrer">Site</a></div>',
      '<div><a href="tg-post:post_1" data-internal-post-id="post_1">Internal</a></div>',
      "<blockquote>Quoted<br>line</blockquote>",
      '<pre data-language="js"><code>const x = 1;\n</code></pre>',
    ].join("");

    expect(editorHtmlToTelegramMarkup(html)).toBe(
      [
        "**Bold** __Italic__ ++Underlined++",
        "[Site](https://example.com/)",
        "[Internal](tg-post:post_1)",
        "> Quoted",
        "> line",
        "```js",
        "const x = 1;",
        "```",
      ].join("\n"),
    );
  });

  it("keeps manually typed markdown symbols as plain text", () => {
    expect(editorHtmlToTelegramMarkup("<div>**manual** __typed__</div>")).toBe(
      "**manual** __typed__",
    );
  });

  it("treats same-line fenced text as a Telegram code block label", () => {
    expect(
      telegramMarkupToEditorHtml(
        "```немає чужого бренду\n→ менша брендова націнка\n```",
      ),
    ).toContain(
      '<pre data-language="немає чужого бренду"><code>→ менша брендова націнка\n</code></pre>',
    );
  });

  it("serializes Telegram preview code blocks back to fenced markup", () => {
    const html =
      '<pre class="tg-code-block" data-code-label="немає чужого бренду" data-has-code-label="true"><span class="tg-code-header" contenteditable="false"><span>немає чужого бренду</span><button type="button" data-copy-code aria-label="Copy code" contenteditable="false"></button></span><code>→ менша брендова націнка\n</code></pre>';

    expect(editorHtmlToTelegramMarkup(html)).toBe(
      "```немає чужого бренду\n→ менша брендова націнка\n```",
    );
  });

  it("keeps a newline before a blockquote when preview editing leaves plain text at the root", () => {
    const html =
      "Відпишися хоча б від десяти джерел, які дають більше шуму, ніж користі.<blockquote>Твоя стрічка — це середовище, у якому щодня живе твоя увага</blockquote>";

    expect(editorHtmlToTelegramMarkup(html)).toBe(
      [
        "Відпишися хоча б від десяти джерел, які дають більше шуму, ніж користі.",
        "> Твоя стрічка — це середовище, у якому щодня живе твоя увага",
      ].join("\n"),
    );
  });

  it("round-trips a preview quote gap as exactly one semantic blank line", () => {
    const html =
      'Text<span class="tg-quote-gap" aria-hidden="true"></span><blockquote>Quote</blockquote>';

    expect(editorHtmlToTelegramMarkup(html)).toBe("Text\n\n> Quote");
  });

  it("round-trips a preview code gap as exactly one semantic blank line", () => {
    const html =
      'Text<span class="tg-quote-gap" aria-hidden="true"></span><pre class="tg-code-block" data-code-label="js" data-has-code-label="true"><code>const value = 1;\n</code></pre>';

    expect(editorHtmlToTelegramMarkup(html)).toBe(
      "Text\n\n```js\nconst value = 1;\n```",
    );
  });

  it("serializes editable rich preview blocks to canonical Telegram markup", () => {
    expect(
      editorHtmlToTelegramMarkup(
        '<h2 class="tg-rich-heading">Title</h2><ul class="tg-rich-list"><li>One</li><li>Two</li></ul><blockquote class="tg-pull-quote">Pull</blockquote><table class="tg-rich-table"><tbody><tr class="tg-rich-table-header"><td>A</td></tr><tr><td>B</td></tr></tbody></table>',
      ),
    ).toBe(
      [
        "## Title",
        "- One",
        "- Two",
        ":::pullquote",
        "Pull",
        ":::",
        ":::table header",
        "| A |",
        "| B |",
        ":::",
      ].join("\n"),
    );
  });

  it("serializes table highlight overrides and alignment metadata", () => {
    expect(
      editorHtmlToTelegramMarkup(
        '<table class="tg-rich-table"><tbody><tr><th data-highlight="true" data-align="center">Header</th><td data-highlight="false" data-align="right">Plain</td></tr><tr><th data-highlight="true" data-align="left">Total</th><td data-highlight="false" data-align="left">10</td></tr></tbody></table>',
      ),
    ).toBe(
      [
        ":::table",
        "| {{cell align=center highlight=true}}Header | {{cell align=right}}Plain |",
        "| {{cell highlight=true}}Total | 10 |",
        ":::",
      ].join("\n"),
    );
  });

  it("preserves rich quote attribution and every explicit preview gap", () => {
    const html = [
      '<pre class="tg-code-block"><code>code</code></pre>',
      '<span class="tg-quote-gap" aria-hidden="true"></span>',
      '<span class="tg-quote-gap" aria-hidden="true"></span>',
      '<span class="tg-quote-gap" aria-hidden="true"></span>',
      '<blockquote class="tg-rich-quote">Quote<cite>Author</cite></blockquote>',
    ].join("");

    expect(editorHtmlToTelegramMarkup(html)).toBe(
      [
        "```",
        "code```",
        "",
        "",
        "",
        ':::quote credit="Author"',
        "Quote",
        ":::",
      ].join("\n"),
    );
  });

  it("preserves internal preview links instead of serializing them as # links", () => {
    const html =
      '<a href="tg-post:cms1gk8p20002htri28wdha4m" data-internal-post-link="cms1gk8p20002htri28wdha4m" data-internal-post-id="cms1gk8p20002htri28wdha4m">цука5е</a>';

    expect(editorHtmlToTelegramMarkup(html)).toBe(
      "[цука5е](tg-post:cms1gk8p20002htri28wdha4m)",
    );
  });
});
