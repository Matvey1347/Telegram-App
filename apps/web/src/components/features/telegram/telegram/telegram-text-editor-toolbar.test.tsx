import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/test/render-with-i18n";
import { TelegramTextEditorToolbar } from "./telegram-text-editor-toolbar";

describe("TelegramTextEditorToolbar", () => {
  it("keeps all editor actions in one horizontally scrollable row", () => {
    render(
      <TelegramTextEditorToolbar
        hasButtons
        onCommand={vi.fn()}
        onHeading={vi.fn()}
        onPullQuoteWithAuthor={vi.fn()}
        onConfigure={vi.fn()}
      />,
    );

    const toolbar = screen.getByRole("button", { name: "Bold" }).parentElement;
    expect(toolbar).toHaveClass("flex-nowrap", "overflow-x-auto");
    expect(toolbar).not.toHaveClass("flex-wrap");
  });
});
