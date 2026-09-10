import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  FINANCE_NAVIGATION_GROUPS,
  FinanceNavigationButton,
  FinanceNavigationGroupHeader,
} from "./finance-navigation-items";

describe("Consumer Finance navigation presentation", () => {
  it("keeps every destination in one logical group", () => {
    const destinations = FINANCE_NAVIGATION_GROUPS.flatMap(
      (group) => group.items,
    );

    expect(FINANCE_NAVIGATION_GROUPS).toHaveLength(4);
    expect(FINANCE_NAVIGATION_GROUPS.map((group) => group.id)).toEqual([
      "summary",
      "money",
      "planning",
      "service",
    ]);
    expect(FINANCE_NAVIGATION_GROUPS.every((group) => group.Icon)).toBe(true);
    expect(new Set(destinations.map((item) => item.id)).size).toBe(
      destinations.length,
    );
    expect(
      FINANCE_NAVIGATION_GROUPS.map((group) =>
        group.items.map((item) => item.id),
      ),
    ).toEqual([
      ["home", "analytics"],
      ["transactions", "transfers", "accounts", "categories"],
      ["budget", "regular-payments", "savings", "debts", "investments"],
      ["reminders"],
    ]);
  });

  it("marks the active item and handles repeated active clicks", () => {
    const onClick = vi.fn();
    const item = FINANCE_NAVIGATION_GROUPS[0].items[0];
    render(
      <FinanceNavigationButton
        item={item}
        label="Overview"
        active
        onClick={onClick}
      />,
    );

    const button = screen.getByRole("button", { name: "Overview" });
    const initialIcon = button.querySelector("[data-finance-icon-sequence]");
    expect(button).toHaveAttribute("aria-current", "page");
    expect(button).toHaveAttribute("data-finance-nav-active", "true");
    expect(button).toHaveAttribute("data-finance-nav-id", "home");
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(2);
    expect(
      button.querySelector("[data-finance-icon-sequence]"),
    ).toHaveAttribute("data-finance-icon-sequence", "2");
    expect(button.querySelector("[data-finance-icon-sequence]")).not.toBe(
      initialIcon,
    );
  });

  it("exposes stable semantic hooks for per-glyph motion", () => {
    const transactions = FINANCE_NAVIGATION_GROUPS[1].items[0];
    render(
      <FinanceNavigationButton
        item={transactions}
        label="Operations"
        active
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Operations" })).toHaveAttribute(
      "data-finance-nav-id",
      "transactions",
    );
  });

  it("renders an icon-bearing collapsible group control", () => {
    const onToggle = vi.fn();
    render(
      <FinanceNavigationGroupHeader
        group={FINANCE_NAVIGATION_GROUPS[1]}
        label="Money"
        collapsed={false}
        controls="money-items"
        onToggle={onToggle}
      />,
    );

    const group = screen.getByRole("button", { name: "Money" });
    expect(group).toHaveAttribute("aria-expanded", "true");
    expect(group).toHaveAttribute("aria-controls", "money-items");
    expect(group.querySelector("svg")).toBeInTheDocument();
    fireEvent.click(group);
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
