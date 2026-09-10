import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/test/render-with-i18n";
import { TelegramTextEditorToolbar } from "./telegram-text-editor-toolbar";

describe("TelegramTextEditorToolbar", () => {
  it("uses one naturally wrapping action flow by default", () => {
    render(
      <TelegramTextEditorToolbar
        hasButtons
        onCommand={vi.fn()}
        onHeading={vi.fn()}
        onPullQuoteWithAuthor={vi.fn()}
        onConfigure={vi.fn()}
      />,
    );

    const toolbar = screen.getByRole("toolbar");
    expect(toolbar).toHaveAttribute("data-layout", "responsive");
    const layout = toolbar.querySelector(
      '[data-toolbar-responsive-layout="true"]',
    );
    expect(layout).toHaveClass(
      "flex",
      "flex-wrap",
      "items-center",
      "gap-x-2",
      "gap-y-1",
      "py-1.5",
    );
    expect(layout).not.toHaveClass("px-1.5", "p-1.5");
    expect(layout).not.toHaveClass("justify-between");
    expect(toolbar.querySelectorAll("[data-toolbar-row]")).toHaveLength(0);
  });

  it("supports the horizontally scrollable single row used by CRM chat", () => {
    render(
      <TelegramTextEditorToolbar
        hasButtons
        singleRow
        onCommand={vi.fn()}
        onHeading={vi.fn()}
        onPullQuoteWithAuthor={vi.fn()}
        onConfigure={vi.fn()}
      />,
    );

    const toolbar = screen.getByRole("toolbar");
    expect(toolbar).toHaveAttribute("data-layout", "single-row");
    expect(toolbar).toHaveClass("overflow-x-auto");
    expect(
      toolbar.querySelector('[data-toolbar-single-row="true"]'),
    ).toHaveClass("flex-nowrap", "gap-2");
  });

  it("renders heading choices in a viewport-level menu", async () => {
    const user = userEvent.setup();
    render(
      <TelegramTextEditorToolbar
        hasButtons
        onCommand={vi.fn()}
        onHeading={vi.fn()}
        onPullQuoteWithAuthor={vi.fn()}
        onConfigure={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Heading" }));

    const menu = screen.getByRole("menu");
    expect(menu.parentElement).toBe(document.body);
    expect(menu).toHaveStyle({ position: "fixed" });
    expect(screen.getByRole("menuitem", { name: "Heading 1" })).toBeTruthy();
  });

  it("closes the open formatting menu after an outside click", async () => {
    const user = userEvent.setup();
    render(
      <TelegramTextEditorToolbar
        hasButtons
        onCommand={vi.fn()}
        onHeading={vi.fn()}
        onPullQuoteWithAuthor={vi.fn()}
        onConfigure={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Heading" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.click(document.body);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("starts with Bold at the toolbar edge and gives dividers the same gap as actions", () => {
    render(
      <TelegramTextEditorToolbar
        hasButtons
        onCommand={vi.fn()}
        onHeading={vi.fn()}
        onPullQuoteWithAuthor={vi.fn()}
        onConfigure={vi.fn()}
      />,
    );

    const toolbar = screen.getByRole("toolbar");
    const layout = toolbar.querySelector(
      '[data-toolbar-responsive-layout="true"]',
    );
    expect(layout?.firstElementChild).toBe(
      screen.getByRole("button", { name: "Bold" }),
    );
    expect(screen.getByRole("button", { name: "Bold" })).toHaveClass("w-8");
    expect(screen.getByRole("button", { name: "Heading" })).toHaveClass(
      "relative",
      "w-8",
    );
    expect(
      screen
        .getByRole("button", { name: "Heading" })
        .querySelector(".lucide-chevron-down"),
    ).toHaveClass("absolute");
    expect(
      screen
        .getByRole("button", { name: "Heading" })
        .querySelector(".lucide-heading"),
    ).toHaveClass("translate-x-px");
    layout
      ?.querySelectorAll('[data-toolbar-divider="true"]')
      .forEach((divider) => expect(divider).toHaveClass("w-px"));
  });
});
