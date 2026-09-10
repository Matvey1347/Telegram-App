import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { financeCoreCopy } from "./i18n/core";
import { FinanceAccountMenu } from "./finance-account-menu";

const profile = {
  id: "profile-1",
  defaultCurrency: "USD",
  timezone: "UTC",
  locale: "en" as const,
  telegramUser: {
    displayName: "Ada Lovelace",
    username: "ada",
    avatarUrl: null,
  },
};

describe("FinanceAccountMenu", () => {
  it("opens from the top avatar and routes account and billing actions", () => {
    const onNavigate = vi.fn();
    render(
      <FinanceAccountMenu
        profile={profile}
        copy={financeCoreCopy("en")}
        screen="home"
        onNavigate={onNavigate}
        onSignOut={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Account" }));
    expect(onNavigate).toHaveBeenCalledWith("profile");

    fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Plan" }));
    expect(onNavigate).toHaveBeenCalledWith("billing");
  });

  it("owns sign out after the sidebar profile is removed", () => {
    const onSignOut = vi.fn();
    render(
      <FinanceAccountMenu
        profile={profile}
        copy={financeCoreCopy("en")}
        screen="profile"
        onNavigate={vi.fn()}
        onSignOut={onSignOut}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));
    expect(screen.getByRole("menuitem", { name: "Account" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it("moves focus through menu items with the keyboard and restores it on Escape", () => {
    render(
      <FinanceAccountMenu
        profile={profile}
        copy={financeCoreCopy("en")}
        screen="home"
        onNavigate={vi.fn()}
        onSignOut={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Open account menu" });
    fireEvent.click(trigger);
    expect(screen.getByRole("menuitem", { name: "Account" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "Plan" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "End" });
    expect(screen.getByRole("menuitem", { name: "Sign out" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
