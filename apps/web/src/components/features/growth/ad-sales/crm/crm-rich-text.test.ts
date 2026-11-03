import { describe, expect, it } from "vitest";
import { renderCrmDraft, serializeCrmDraft } from "./crm-rich-text";

describe("CRM draft rich text", () => {
  it("renders formatting while preserving draft markup, escaping and premium identity", () => {
    const node = document.createElement("div");
    const value = "**Hello** __world__\\!\n> quoted\n![🤝](tg://emoji?id=123)";
    renderCrmDraft(node, value);
    expect(node.querySelector("strong")?.textContent).toBe("Hello");
    expect(node.querySelector("em")?.textContent).toBe("world");
    expect(node.querySelector("[data-quote]")?.textContent).toBe("quoted");
    expect(serializeCrmDraft(node)).toBe(value);
  });
  it("renders links and keeps incomplete syntax literal", () => {
    const node = document.createElement("div");
    const value = "[link](https://example.com) and **unfinished\n";
    renderCrmDraft(node, value);
    expect(node.querySelector("[data-link]")?.textContent).toBe("link");
    expect(serializeCrmDraft(node)).toBe(value);
  });
  it("preserves browser line breaks and ignores pasted HTML semantics", () => {
    const node = document.createElement("div");
    node.innerHTML = "first<div>second</div>";
    expect(serializeCrmDraft(node)).toBe("first\nsecond");
  });
});

describe("nested CRM draft formatting", () => {
  it("round trips nested formats and editing plain text", () => {
    const node = document.createElement("div");
    renderCrmDraft(node, "Before **bold __italic__** after");
    expect(node.querySelector("strong em")?.textContent).toBe("italic");
    expect(serializeCrmDraft(node)).toBe("Before **bold __italic__** after");
    node.firstChild!.textContent = "Changed ";
    expect(serializeCrmDraft(node)).toBe("Changed **bold __italic__** after");
  });
});

describe("editable rich blocks", () => {
  it("renders code and table while preserving surrounding text and serializing edits", () => {
    const node = document.createElement("div");
    const value = "Before\n```js\nconst x = 1;\n```\n:::table header\n| Name | **Value** |\n| A | 2 |\n:::\nAfter";
    renderCrmDraft(node, value);
    expect(node.querySelector("[data-code-block]")?.textContent).toBe("const x = 1;\n");
    expect(node.querySelectorAll("[data-table-cell]")).toHaveLength(4);
    expect(serializeCrmDraft(node)).toBe(value);
    node.querySelector("[data-code-block]")!.textContent = "const x = 3;\n";
    node.querySelectorAll("[data-table-cell]")[2].textContent = " B ";
    expect(serializeCrmDraft(node)).toContain("const x = 3;\n```");
    expect(serializeCrmDraft(node)).toContain("| B | 2 |");
  });
  it("preserves incomplete and unsupported blocks literally", () => {
    const node = document.createElement("div");
    for (const value of ["```js\nunfinished", ":::table\nnot a pipe row\n:::"]) {
      renderCrmDraft(node, value);
      expect(serializeCrmDraft(node)).toBe(value);
    }
  });
});
