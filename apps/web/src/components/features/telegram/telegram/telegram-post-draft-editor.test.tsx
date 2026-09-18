import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TelegramPostDraftEditor } from "./telegram-post-draft-editor";

vi.mock("./telegram-post-preview", () => ({
  TelegramPostPreview: (props: Record<string, unknown>) => (
    <div
      data-testid="preview"
      data-plain={String(props.plainText)}
      data-html={String(props.formattedHtml)}
      data-media={JSON.stringify(props.mediaItems)}
      data-buttons={JSON.stringify(props.buttonRows)}
    />
  ),
}));
vi.mock("./telegram-text-editor", () => ({
  TelegramTextEditor: ({ onChange }: { onChange: (text: string) => void }) => (
    <button type="button" onClick={() => onChange("Edited text")}>Edit text</button>
  ),
}));
vi.mock("./telegram-post-media-upload", () => ({
  TelegramPostMediaUpload: () => <div>Media editor</div>,
}));

describe("TelegramPostDraftEditor", () => {
  it("preserves normalized formatting, media and buttons until text is edited", () => {
    const onChange = vi.fn();
    const draft = {
      title: "Imported",
      text: "**Bold**",
      plainText: "Bold",
      formattedHtml: "<b>Bold</b>",
      imageUrls: ["https://cdn.test/photo.jpg"],
      mediaItems: [{ kind: "PHOTO" as const, url: "https://cdn.test/photo.jpg" }],
      buttonRows: [[{ text: "Open", url: "https://example.test", style: "primary" as const }]],
    };
    render(
      <TelegramPostDraftEditor
        draft={draft}
        channelTitle="Channel"
        onChange={onChange}
      />,
    );
    expect(screen.getByTestId("preview")).toHaveAttribute("data-plain", "Bold");
    expect(screen.getByTestId("preview")).toHaveAttribute("data-html", "<b>Bold</b>");
    expect(screen.getByTestId("preview").getAttribute("data-media")).toContain("photo.jpg");
    expect(screen.getByTestId("preview").getAttribute("data-buttons")).toContain("Open");

    fireEvent.click(screen.getByRole("button", { name: "Edit text" }));
    expect(onChange).toHaveBeenCalledWith({
      ...draft,
      text: "Edited text",
      plainText: undefined,
      formattedHtml: undefined,
    });
  });
});
