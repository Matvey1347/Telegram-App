import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PromoPostEditorSection } from "./promo-post-editor-section";

const baseProps = {
  expanded: false,
  hasContent: false,
  connected: true,
  connectionLoading: false,
  importStatus: "idle" as const,
  dots: 1,
  onImport: vi.fn(),
  onToggleEditor: vi.fn(),
};

describe("PromoPostEditorSection", () => {
  it("keeps the editor collapsed behind manual and bot actions", () => {
    const onImport = vi.fn();
    const onToggleEditor = vi.fn();
    render(
      <PromoPostEditorSection
        {...baseProps}
        onImport={onImport}
        onToggleEditor={onToggleEditor}
      >
        <div>Post editor</div>
      </PromoPostEditorSection>,
    );

    expect(screen.getByRole("region", { name: "Promo post" })).toHaveClass(
      "p-3",
    );
    expect(screen.queryByText("Post editor")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Import from bot/ }));
    fireEvent.click(screen.getByRole("button", { name: /Edit manually/ }));
    expect(onImport).toHaveBeenCalledOnce();
    expect(onToggleEditor).toHaveBeenCalledOnce();
  });

  it("renders the same editor after it is expanded", () => {
    render(
      <PromoPostEditorSection {...baseProps} expanded hasContent>
        <div>Post editor</div>
      </PromoPostEditorSection>,
    );

    expect(screen.getByText("Post editor")).toBeVisible();
    expect(screen.getByRole("button", { name: /Hide editor/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("handles an unavailable bot and a failed import", () => {
    const onImport = vi.fn();
    const { rerender } = render(
      <PromoPostEditorSection
        {...baseProps}
        connected={false}
        onImport={onImport}
      >
        <div>Post editor</div>
      </PromoPostEditorSection>,
    );

    expect(
      screen.getByRole("button", { name: /Import from bot/ }),
    ).toBeDisabled();
    expect(screen.getByText(/Connect the workspace system bot/)).toBeVisible();

    rerender(
      <PromoPostEditorSection
        {...baseProps}
        error="Could not start import."
        onImport={onImport}
      >
        <div>Post editor</div>
      </PromoPostEditorSection>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onImport).toHaveBeenCalledOnce();
  });
});
