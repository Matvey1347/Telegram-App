import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { financeCoreCopy } from "./i18n/core";
import { FinanceMobileNavigation } from "./finance-mobile-navigation";

describe("Finance mobile navigation", () => {
  it("keeps primary screens in the app bar and secondary screens under More", () => {
    const onNavigate = vi.fn();
    render(
      <FinanceMobileNavigation
        screen="home"
        copy={financeCoreCopy("en")}
        onNavigate={onNavigate}
      />,
    );

    expect(screen.getByRole("button", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: "Transactions" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Accounts" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "More" }));
    const sheet = screen.getByRole("dialog", { name: "More" });
    expect(sheet).toHaveAttribute("aria-modal", "true");
    expect(sheet).toHaveClass("bottom-0", "rounded-t-3xl", "border-b-0");
    expect(within(sheet).getByRole("button", { name: "Close" })).toBeVisible();
    expect(document.body.style.overflow).toBe("hidden");
    expect(
      within(sheet).getByRole("button", { name: "Accounts" }),
    ).toBeVisible();
    const moneyGroup = within(sheet).getByRole("button", { name: "Money" });
    expect(moneyGroup).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(moneyGroup);
    expect(moneyGroup).toHaveAttribute("aria-expanded", "false");
    expect(
      within(sheet).queryByRole("button", { name: "Accounts" }),
    ).toBeNull();
    fireEvent.click(moneyGroup);
    fireEvent.click(within(sheet).getByRole("button", { name: "Accounts" }));
    expect(onNavigate).toHaveBeenCalledWith("accounts");
    expect(screen.queryByRole("button", { name: "Accounts" })).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  it("traps sheet focus, closes on Escape and restores the More trigger", async () => {
    render(
      <FinanceMobileNavigation
        screen="home"
        copy={financeCoreCopy("en")}
        onNavigate={vi.fn()}
      />,
    );
    const trigger = screen.getByRole("button", { name: "More" });
    fireEvent.click(trigger);
    const sheet = screen.getByRole("dialog", { name: "More" });
    const controls = within(sheet).getAllByRole("button");
    await waitFor(() => expect(controls[0]).toHaveFocus());

    controls.at(-1)?.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(controls[0]).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "More" })).toBeNull();
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
