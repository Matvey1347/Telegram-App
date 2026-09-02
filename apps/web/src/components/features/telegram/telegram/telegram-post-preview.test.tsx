import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithI18n as render } from "@/test/render-with-i18n";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { TelegramPostPreview } from "@/components/features/telegram/telegram/telegram-post-preview";

describe("TelegramPostPreview", () => {
  it("renders per-message engagement metrics and reaction breakdowns when provided", () => {
    render(
      <TelegramPostPreview
        channelTitle="Channel"
        text="Synced post"
        imageUrls={[]}
        engagement={[
          {
            telegramPostId: "post-1",
            telegramMessageId: "101",
            viewsCount: 1250,
            forwardsCount: 14,
            reactionsCount: 55,
            commentsCount: 8,
            adjustedViewsCount: 1240,
            adjustedReactionsCount: 54,
            subscriberCount: 2000,
            err: 62,
            reactionRate: 4.35,
            forwardRate: 1.13,
            commentRate: 0.65,
            reactions: [{ reaction: "🔥", count: 25 }],
          },
          {
            telegramPostId: "post-2",
            telegramMessageId: "102",
            viewsCount: 1100,
            forwardsCount: 5,
            reactionsCount: 20,
            commentsCount: 2,
            adjustedViewsCount: 1090,
            adjustedReactionsCount: 19,
            subscriberCount: 2000,
            err: 54.5,
            reactionRate: 1.74,
            forwardRate: 0.45,
            commentRate: 0.18,
            reactions: null,
          },
        ]}
      />,
    );

    expect(screen.getByLabelText("Telegram post engagement")).toBeVisible();
    expect(screen.getAllByLabelText("Views")).toHaveLength(2);
    expect(screen.getAllByLabelText("Reactions")).toHaveLength(2);
    expect(screen.getAllByLabelText("Comments")).toHaveLength(2);
    expect(screen.getAllByLabelText("Forwards")).toHaveLength(2);
    expect(screen.getByText("Telegram message 1 · ID 101")).toBeVisible();
    expect(screen.getByText("Telegram message 2 · ID 102")).toBeVisible();
    expect(screen.getByText("1.3K")).toBeVisible();
    expect(screen.getByText("🔥 25")).toBeVisible();
    expect(screen.getByText("62.00%")).toBeVisible();
  });

  it("shows a Telegram media placeholder when synced media has no local URL", () => {
    render(
      <TelegramPostPreview
        channelTitle="Channel"
        text=""
        imageUrls={[]}
        hasMedia
      />,
    );

    expect(screen.getByText("Media attached in Telegram")).toBeVisible();
  });

  it("shows markers for numbered and bulleted lists despite the global CSS reset", () => {
    const { container } = render(
      <TelegramPostPreview
        channelTitle="Channel"
        text={"1. First\n2. Second\n\n- Third\n- Fourth"}
        imageUrls={[]}
      />,
    );

    const orderedList = container.querySelector("ol.tg-rich-list");
    const unorderedList = container.querySelector("ul.tg-rich-list");

    expect(orderedList).toHaveStyle({ listStyleType: "decimal" });
    expect(orderedList?.querySelectorAll("li")).toHaveLength(2);
    expect(unorderedList).toHaveStyle({ listStyleType: "disc" });
    expect(unorderedList?.querySelectorAll("li")).toHaveLength(2);
  });

  it("renders inline emphasis in lists and highlights Unicode hashtags", () => {
    const { container } = render(
      <TelegramPostPreview
        channelTitle="Channel"
        text={
          "Порада #емоції\n\n1. **Зупинити дію** — зробити паузу #самодопомога\n2. __Назвати стан__"
        }
        imageUrls={[]}
      />,
    );

    const orderedItems = container.querySelectorAll("ol.tg-rich-list li");
    expect(orderedItems[0]?.querySelector("b")).toHaveTextContent(
      "Зупинити дію",
    );
    expect(orderedItems[1]?.querySelector("i")).toHaveTextContent(
      "Назвати стан",
    );
    expect(container.querySelectorAll(".tg-hashtag")).toHaveLength(2);
    expect(container.querySelector(".tg-hashtag")).toHaveTextContent("#емоції");
  });

  it("starts animated Premium emoji in the editable preview and keeps its ALT fallback", () => {
    const { container } = render(
      <TelegramPostPreview
        channelTitle="Channel"
        text="![wave](tg://emoji?id=456)"
        imageUrls={[]}
        onTextChange={() => {}}
        customEmojiPacks={[
          {
            id: "pack_1",
            shortName: "team",
            title: "Team",
            telegramLink: "https://t.me/addemoji/team",
            emojis: [
              {
                id: "emoji_1",
                documentId: "456",
                alt: "wave",
                kind: "ANIMATED",
                mimeType: "application/x-tgsticker",
                isFree: true,
                needsRepainting: false,
                position: 0,
                assetUrl: "https://cdn.test/wave.tgs",
                renderAssetUrl: "https://cdn.test/wave.json",
              },
            ],
          },
        ]}
      />,
    );

    const emoji = container.querySelector<HTMLElement>("[data-lottie-url]");
    expect(emoji).toHaveAttribute(
      "data-lottie-url",
      "https://cdn.test/wave.json",
    );
    expect(emoji?.textContent).toBe("wave");
    expect(emoji?.className).toContain("tg-custom-emoji-lottie");
    expect(emoji?.parentElement?.className).toContain("tg-custom-emoji");
  });

  it("marks static Premium emoji for inline, text-sized rendering", () => {
    const { container, rerender } = render(
      <TelegramPostPreview
        channelTitle="Channel"
        text="![spark](tg://emoji?id=123)"
        imageUrls={[]}
        onTextChange={() => {}}
        customEmojiPacks={[
          {
            id: "pack_1",
            shortName: "team",
            title: "Team",
            telegramLink: "https://t.me/addemoji/team",
            emojis: [
              {
                id: "emoji_1",
                documentId: "123",
                alt: "spark",
                kind: "STATIC",
                mimeType: "image/webp",
                isFree: true,
                needsRepainting: false,
                position: 0,
                assetUrl: "https://cdn.test/spark.webp",
                renderAssetUrl: null,
              },
            ],
          },
        ]}
      />,
    );

    expect(container.querySelector(".tg-custom-emoji > img")).toHaveAttribute(
      "src",
      "https://cdn.test/spark.webp",
    );

    rerender(
      <TelegramPostPreview
        channelTitle="Channel"
        text="![spark](tg://emoji?id=123) updated"
        imageUrls={[]}
        onTextChange={() => {}}
      />,
    );

    expect(container.querySelector(".tg-custom-emoji > img")).toHaveAttribute(
      "src",
      "https://cdn.test/spark.webp",
    );
  });

  it("renders a single image at its original aspect ratio without a cropping container", () => {
    const { container } = render(
      <TelegramPostPreview
        channelTitle="Ментор | Саморозвиток"
        text={
          "> Ти хочеш щось вирішити чи просто довести, що маєш рацію?\n[Ментор | Саморозвиток]"
        }
        imageUrls={["https://cdn.test/quote-image.png"]}
      />,
    );

    const blockquote = container.querySelector("blockquote");
    expect(blockquote).toBeTruthy();
    expect(blockquote?.textContent).toContain(
      "Ти хочеш щось вирішити чи просто довести, що маєш рацію?",
    );

    const textContainer = container.querySelector(".telegram-preview-text");
    expect(textContainer?.parentElement?.className).toContain("px-4");

    const previewImage = container.querySelector(
      'img[src="https://cdn.test/quote-image.png"]',
    );
    expect(previewImage?.className).toContain("object-contain");
    expect(previewImage?.className).toContain("h-auto");
    expect(previewImage?.parentElement?.className).not.toMatch(/aspect-/);
    expect(previewImage?.parentElement?.className).not.toContain(
      "overflow-hidden",
    );
  });

  it("keeps Telegram album media in the tiled layout", () => {
    const { container } = render(
      <TelegramPostPreview
        channelTitle="Ментор | Саморозвиток"
        text="Album"
        imageUrls={["https://cdn.test/one.png", "https://cdn.test/two.png"]}
      />,
    );

    const images = container.querySelectorAll('img[src^="https://cdn.test/"]');
    expect(images).toHaveLength(2);
    expect(images[0]?.className).toContain("object-cover");
    expect(images[0]?.parentElement?.className).toContain("aspect-square");
  });

  it("keeps a premium-length caption with an image in one preview message", () => {
    const { container } = render(
      <TelegramPostPreview
        channelTitle="Ментор | Саморозвиток"
        text={"A".repeat(3_500)}
        imageUrls={["https://cdn.test/premium-caption.png"]}
        captionLengthMax={4_096}
      />,
    );

    expect(container.querySelectorAll(".telegram-preview-text")).toHaveLength(
      1,
    );
    expect(
      container.querySelectorAll(
        'img[src="https://cdn.test/premium-caption.png"]',
      ),
    ).toHaveLength(1);
  });

  it("adds a quote gap only when the source text contains an empty line before the quote", () => {
    const withGap = render(
      <TelegramPostPreview
        channelTitle="Ментор | Саморозвиток"
        text={"Перший абзац.\n\n> Цитата з відступом"}
        imageUrls={[]}
      />,
    );
    expect(withGap.container.querySelector(".tg-quote-gap")).toBeTruthy();

    const withoutGap = render(
      <TelegramPostPreview
        channelTitle="Ментор | Саморозвиток"
        text={"Перший абзац.\n> Цитата без відступу"}
        imageUrls={[]}
      />,
    );
    expect(withoutGap.container.querySelector(".tg-quote-gap")).toBeFalsy();
  });

  it("renders same-line fenced text with spaces as a labeled Telegram code block", () => {
    const { container } = render(
      <TelegramPostPreview
        channelTitle="Ментор | Саморозвиток"
        text={"```немає чужого бренду\n→ менша брендова націнка\n```"}
        imageUrls={[]}
      />,
    );

    const codeHeader = container.querySelector(".tg-code-header span");
    const codeBlock = container.querySelector(".tg-code-block code");
    expect(codeHeader?.textContent).toBe("немає чужого бренду");
    expect(codeBlock?.textContent).toContain("→ менша брендова націнка");
  });

  it("keeps Telegram code blocks inside the editable preview", () => {
    const { container } = render(
      <TelegramPostPreview
        channelTitle="Ментор | Саморозвиток"
        text={"```немає чужого бренду\n→ менша брендова націнка\n```"}
        imageUrls={[]}
        onTextChange={() => {}}
      />,
    );

    const editor = container.querySelector(
      '.telegram-preview-text[contenteditable="true"]',
    );
    const codeHeader = container.querySelector(".tg-code-header");
    const copyButton = container.querySelector("[data-copy-code]");

    expect(editor).toBeTruthy();
    expect(codeHeader?.textContent).toContain("немає чужого бренду");
    expect(copyButton).toBeTruthy();
  });

  it("does not add an extra gap after a code block when the source has only one newline", () => {
    const { container } = render(
      <TelegramPostPreview
        channelTitle="Ментор | Саморозвиток"
        text={
          "Суть проста:\n```немає чужого бренду\n→ менша брендова націнка\n```\n📦 Для Pepco це особливо важливо"
        }
        imageUrls={[]}
      />,
    );

    const preview = container.querySelector(".telegram-preview-text");
    expect(preview?.innerHTML).toContain("Суть проста:<pre");
    expect(preview?.innerHTML).toContain(
      "</pre>📦 Для Pepco це особливо важливо",
    );
    expect(preview?.innerHTML).not.toContain("</pre><br>");
    expect(preview?.querySelectorAll(".tg-quote-gap")).toHaveLength(0);
  });

  it("keeps a visual gap after a code block when the source has an empty line", () => {
    const { container } = render(
      <TelegramPostPreview
        channelTitle="Ментор | Саморозвиток"
        text={
          "Суть проста:\n```немає чужого бренду\n→ менша брендова націнка\n```\n\n📦 Для Pepco це особливо важливо"
        }
        imageUrls={[]}
      />,
    );

    const preview = container.querySelector(".telegram-preview-text");
    expect(preview?.innerHTML).toContain(
      '</pre><span class="tg-quote-gap" aria-hidden="true"></span>📦 Для Pepco це особливо важливо',
    );
  });

  it("preserves every explicit empty line between a code block and a quote", () => {
    const { container } = render(
      <TelegramPostPreview
        channelTitle="Channel"
        text={["```", "code", "```", "", "", "", "> Quote"].join("\n")}
        imageUrls={[]}
      />,
    );

    expect(
      container.querySelectorAll(".tg-code-block + .tg-quote-gap"),
    ).toHaveLength(1);
    expect(container.querySelectorAll(".tg-quote-gap")).toHaveLength(3);
  });

  it("keeps an explicit gap between adjacent rich blocks", () => {
    const { container } = render(
      <TelegramPostPreview
        channelTitle="Channel"
        text={[
          ":::table header",
          "| Header |",
          "| Cell |",
          ":::",
          "",
          ":::pullquote",
          "Pull quote",
          ":::",
        ].join("\n")}
        imageUrls={[]}
      />,
    );

    const preview = container.querySelector(".telegram-preview-text");
    expect(preview?.innerHTML).toContain(
      '</table><span class="tg-quote-gap" aria-hidden="true"></span><aside class="tg-pull-quote">',
    );
  });

  it("renders consecutive pull quotes independently, including the author", () => {
    const { container } = render(
      <TelegramPostPreview
        channelTitle="Channel"
        text={[
          "> Quote",
          "",
          ":::pullquote",
          "First pull quote",
          ":::",
          "",
          ':::pullquote credit="Ada"',
          "Second pull quote",
          ":::",
        ].join("\n")}
        imageUrls={[]}
      />,
    );

    const preview = container.querySelector(".telegram-preview-text");
    expect(preview?.querySelectorAll("aside.tg-pull-quote")).toHaveLength(2);
    expect(preview?.textContent).toContain("First pull quote");
    expect(preview?.textContent).toContain("Second pull quote");
    expect(preview?.querySelector("aside cite")?.textContent).toBe("Ada");
    expect(preview?.textContent).not.toContain(":::pullquote");
  });

  it("edits table alignment, highlighting, rows and columns from the cell menu", async () => {
    const onTextChange = vi.fn();
    const { container } = render(
      <TelegramPostPreview
        channelTitle="Channel"
        text={[
          ":::table header",
          "| Header 1 | Header 2 |",
          "| Cell 1 | Cell 2 |",
          ":::",
        ].join("\n")}
        imageUrls={[]}
        onTextChange={onTextChange}
      />,
    );
    const firstCell = container.querySelector("th") as HTMLElement;

    fireEvent.contextMenu(firstCell);
    fireEvent.click(screen.getByRole("menuitem", { name: "Align Center" }));
    await waitFor(() =>
      expect(onTextChange).toHaveBeenLastCalledWith(
        expect.stringContaining("{{cell align=center}}Header 1"),
      ),
    );

    fireEvent.contextMenu(firstCell);
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove Highlight" }));
    await waitFor(() =>
      expect(onTextChange).toHaveBeenLastCalledWith(
        expect.stringContaining(
          "| {{cell align=center}}Header 1 | {{cell highlight=true}}Header 2 |",
        ),
      ),
    );

    fireEvent.contextMenu(firstCell);
    fireEvent.click(screen.getByRole("menuitem", { name: "Insert Right" }));
    expect(container.querySelectorAll("tr")[0]?.cells).toHaveLength(3);

    fireEvent.contextMenu(firstCell);
    fireEvent.click(screen.getByRole("menuitem", { name: "Insert Below" }));
    expect(container.querySelectorAll("tr")).toHaveLength(3);

    fireEvent.contextMenu(firstCell);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete Column" }));
    expect(container.querySelectorAll("tr")[0]?.cells).toHaveLength(2);

    const remainingCell = container.querySelector("th, td") as HTMLElement;
    fireEvent.contextMenu(remainingCell);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete Row" }));
    expect(container.querySelectorAll("tr")).toHaveLength(2);
  });

  it("preserves the blank line before a quote when an editable preview blurs", async () => {
    const onTextChange = vi.fn();
    const { container } = render(
      <TelegramPostPreview
        channelTitle="Ментор | Саморозвиток"
        text={"Text\n\n> Quote"}
        imageUrls={[]}
        onTextChange={onTextChange}
      />,
    );
    const editor = container.querySelector(
      '.telegram-preview-text[contenteditable="true"]',
    ) as HTMLElement;

    editor.firstChild!.textContent = "Edited text";
    fireEvent.input(editor);
    fireEvent.blur(editor);

    await waitFor(() => {
      expect(onTextChange).toHaveBeenLastCalledWith("Edited text\n\n> Quote");
    });
  });

  it("preserves the blank line before a code block when an editable preview blurs", async () => {
    const onTextChange = vi.fn();
    const { container } = render(
      <TelegramPostPreview
        channelTitle="Ментор | Саморозвиток"
        text={"Text\n\n```js\nconst value = 1;\n```"}
        imageUrls={[]}
        onTextChange={onTextChange}
      />,
    );
    const editor = container.querySelector(
      '.telegram-preview-text[contenteditable="true"]',
    ) as HTMLElement;

    editor.firstChild!.textContent = "Edited text";
    fireEvent.input(editor);
    fireEvent.blur(editor);

    await waitFor(() => {
      expect(onTextChange).toHaveBeenLastCalledWith(
        "Edited text\n\n```js\nconst value = 1;\n```",
      );
    });
  });

  it("does not emit a changed value for a no-op editable-preview blur", () => {
    const onTextChange = vi.fn();
    const { container } = render(
      <TelegramPostPreview
        channelTitle="Ментор | Саморозвиток"
        text={"Text\n\n> Quote"}
        imageUrls={[]}
        onTextChange={onTextChange}
      />,
    );
    const editor = container.querySelector(
      '.telegram-preview-text[contenteditable="true"]',
    ) as HTMLElement;

    fireEvent.blur(editor);

    expect(onTextChange).not.toHaveBeenCalled();
  });

  it("keeps the browser-owned editable DOM for a local controlled echo", async () => {
    const user = userEvent.setup();

    function PreviewHarness() {
      const [value, setValue] = useState("Start");
      return (
        <>
          <TelegramPostPreview
            channelTitle="Ментор | Саморозвиток"
            text={value}
            imageUrls={[]}
            onTextChange={setValue}
          />
          <output data-testid="preview-value">{value}</output>
        </>
      );
    }

    const { container } = render(<PreviewHarness />);
    const editor = container.querySelector(
      '.telegram-preview-text[contenteditable="true"]',
    ) as HTMLElement;
    await user.click(editor);
    editor.innerHTML = "<div>Changed</div>";
    const browserOwnedNode = editor.firstElementChild;
    const textNode = browserOwnedNode?.firstChild as Text;
    const selection = window.getSelection();
    const range = document.createRange();
    range.setStart(textNode, textNode.length);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);

    fireEvent.input(editor);

    await waitFor(() => {
      expect(screen.getByTestId("preview-value").textContent).toBe("Changed");
    });
    expect(editor.firstElementChild).toBe(browserOwnedNode);
    expect(selection?.getRangeAt(0).startContainer).toBe(textNode);
  });

  it("renders a genuine external value change into the editable preview", async () => {
    const { container, rerender } = render(
      <TelegramPostPreview
        channelTitle="Ментор | Саморозвиток"
        text="Start"
        imageUrls={[]}
        onTextChange={() => {}}
      />,
    );
    const editor = container.querySelector(
      '.telegram-preview-text[contenteditable="true"]',
    ) as HTMLElement;

    rerender(
      <TelegramPostPreview
        channelTitle="Ментор | Саморозвиток"
        text="External update"
        imageUrls={[]}
        onTextChange={() => {}}
      />,
    );

    await waitFor(() => {
      expect(editor.textContent).toBe("External update");
    });
  });

  it("handles native preview undo and redo directly inside the editable preview", async () => {
    const user = userEvent.setup();

    function PreviewHarness() {
      const [value, setValue] = useState("Start");
      return (
        <>
          <TelegramPostPreview
            channelTitle="Ментор | Саморозвиток"
            text={value}
            imageUrls={[]}
            onTextChange={setValue}
          />
          <output data-testid="preview-value">{value}</output>
        </>
      );
    }

    const { container } = render(<PreviewHarness />);
    const editor = container.querySelector(".telegram-preview-text");
    expect(editor).toBeTruthy();

    await user.click(editor as HTMLElement);
    (editor as HTMLElement).innerHTML = "<div>Changed</div>";
    fireEvent.input(editor as HTMLElement);
    await waitFor(() => {
      expect(screen.getByTestId("preview-value").textContent).toBe("Changed");
    });

    editor?.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "historyUndo",
      }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("preview-value").textContent).toBe("Start");
    });

    editor?.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "historyRedo",
      }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("preview-value").textContent).toBe("Changed");
    });
  });

  it("collapses preview selection on undo even when there is no history entry", async () => {
    const user = userEvent.setup();

    function PreviewHarness() {
      const [value, setValue] = useState("Start text");
      return (
        <TelegramPostPreview
          channelTitle="Ментор | Саморозвиток"
          text={value}
          imageUrls={[]}
          onTextChange={setValue}
        />
      );
    }

    const { container } = render(<PreviewHarness />);
    const editor = container.querySelector(
      ".telegram-preview-text",
    ) as HTMLElement;
    expect(editor).toBeTruthy();

    await user.click(editor);
    const textNode = editor.firstChild?.firstChild ?? editor.firstChild;
    expect(textNode).toBeTruthy();

    const selection = window.getSelection();
    const range = document.createRange();
    range.setStart(textNode as Node, 0);
    range.setEnd(textNode as Node, 5);
    selection?.removeAllRanges();
    selection?.addRange(range);
    expect(selection?.isCollapsed).toBe(false);

    editor.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "historyUndo",
      }),
    );

    expect(selection?.isCollapsed).toBe(true);
  });
});
