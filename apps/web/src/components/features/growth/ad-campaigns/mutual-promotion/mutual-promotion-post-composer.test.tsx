import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MutualPromotionPostComposer } from "./mutual-promotion-post-composer";

vi.mock(
  "@/components/features/telegram/telegram/telegram-post-preview",
  () => ({
    TelegramPostPreview: ({ text }: { text: string }) => (
      <div data-testid="telegram-preview">{text}</div>
    ),
  }),
);

vi.mock("@/components/features/telegram/telegram/telegram-text-editor", () => ({
  TelegramTextEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <textarea
      aria-label="Post text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

vi.mock(
  "@/components/features/telegram/telegram/telegram-image-upload",
  () => ({
    TelegramImageUpload: () => <div>Image editor</div>,
  }),
);

describe("MutualPromotionPostComposer", () => {
  it("renders managed Telegram markup in preview and exposes manual editing", () => {
    const onChange = vi.fn();
    render(
      <MutualPromotionPostComposer
        channelTitle="Publisher"
        draft={{
          title: "Imported",
          text: "**Bold** [link](https://example.test)",
          imageUrls: [],
          buttonRows: [],
        }}
        onChange={onChange}
      />,
    );

    expect(screen.getByTestId("telegram-preview")).toHaveTextContent(
      "**Bold** [link](https://example.test)",
    );
    fireEvent.change(screen.getByLabelText("Post text"), {
      target: { value: "__Edited__" },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ text: "__Edited__" }),
    );
  });
});
