import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MutualPromotionPostComposer } from "./mutual-promotion-post-composer";

vi.mock(
  "@/components/features/telegram/telegram/telegram-post-preview",
  () => ({
    TelegramPostPreview: ({
      text,
      formattedHtml,
      onTextChange,
      captionLengthMax,
      messageLengthMax,
    }: {
      text: string;
      formattedHtml?: string | null;
      onTextChange?: (value: string) => void;
      captionLengthMax?: number;
      messageLengthMax?: number;
    }) => (
      <button
        type="button"
        data-testid="telegram-preview"
        data-caption-limit={captionLengthMax}
        data-message-limit={messageLengthMax}
        data-formatted-html={formattedHtml}
        onClick={() => onTextChange?.("__Edited__")}
      >
        {text}
      </button>
    ),
  }),
);

vi.mock(
  "@/components/features/telegram/telegram/telegram-inline-keyboard-editor",
  () => ({
    TelegramInlineKeyboardEditor: () => null,
    TelegramInlineKeyboardSummary: () => <div>Telegram buttons</div>,
  }),
);

vi.mock(
  "@/components/features/telegram/telegram/telegram-post-media-upload",
  () => ({
    TelegramPostMediaUpload: () => <div>Media editor</div>,
  }),
);

describe("MutualPromotionPostComposer", () => {
  it("edits imported text visually and uses Premium Telegram limits", () => {
    const onChange = vi.fn();
    render(
      <MutualPromotionPostComposer
        channelTitle="Publisher"
        draft={{
          title: "Imported",
          text: "**Bold** [link](https://example.test)",
          plainText: "Bold link",
          formattedHtml: '<b>Bold</b> <a href="https://example.test">link</a>',
          imageUrls: [],
          buttonRows: [],
        }}
        onChange={onChange}
      />,
    );

    expect(screen.getByTestId("telegram-preview")).toHaveTextContent(
      "**Bold** [link](https://example.test)",
    );
    expect(screen.getByTestId("telegram-preview")).toHaveAttribute(
      "data-caption-limit",
      "4096",
    );
    expect(screen.getByTestId("telegram-preview")).toHaveAttribute(
      "data-formatted-html",
      '<b>Bold</b> <a href="https://example.test">link</a>',
    );
    expect(screen.queryByLabelText("Post text")).toBeNull();
    fireEvent.click(screen.getByTestId("telegram-preview"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "__Edited__",
        plainText: undefined,
        formattedHtml: undefined,
      }),
    );
  });
});
