import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  SavingState,
  SyncingState,
  WaitingState,
} from "./finance-surfaces";
import { FinanceVisualContextProvider } from "./finance-visual-context";

describe("Finance state illustration system", () => {
  const contexts = [
    "overview",
    "transactions",
    "transfers",
    "debts",
    "recurringPayments",
    "savings",
    "investments",
    "accounts",
    "categories",
    "analytics",
    "budget",
    "reminders",
    "plan",
    "settings",
  ] as const;

  it.each([
    ["loading", LoadingState],
    ["waiting", WaitingState],
    ["saving", SavingState],
    ["syncing", SyncingState],
    ["empty", EmptyState],
    ["error", ErrorState],
  ] as const)(
    "renders the %s state through the shared visual",
    (state, State) => {
      render(<State text={`${state} copy`} context="transfers" />);

      expect(screen.getByText(`${state} copy`)).toBeInTheDocument();
      expect(
        document.querySelector(
          `[data-finance-state='${state}'][data-finance-context='transfers']`,
        ),
      ).toBeInTheDocument();
    },
  );

  it("inherits the active section and keeps errors assertive", () => {
    render(
      <FinanceVisualContextProvider value="investments">
        <ErrorState text="Could not load investments" />
      </FinanceVisualContextProvider>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not load investments",
    );
    expect(
      document.querySelector("[data-finance-context='investments']"),
    ).toBeInTheDocument();
  });

  it("keeps the visual context while using the shared branded wallet", () => {
    const { rerender } = render(
      <EmptyState text="No transfers" context="transfers" />,
    );
    expect(
      document.querySelector("[data-finance-context='transfers']"),
    ).toHaveAttribute("data-finance-visual-kind", "flow");

    rerender(<EmptyState text="No analytics" context="analytics" />);
    expect(
      document.querySelector("[data-finance-context='analytics']"),
    ).toHaveAttribute("data-finance-visual-kind", "growth");
  });

  it("keeps every illustration full-width with its copy below it", () => {
    const { rerender } = render(
      <EmptyState text="No transfers" context="transfers" />,
    );
    expect(document.querySelector("[data-finance-state='empty']")).toHaveClass(
      "w-full",
      "aspect-[600/136]",
    );
    expect(
      document.querySelector("[data-finance-state='empty']"),
    ).not.toHaveClass("max-w-[760px]");
    expect(
      document.querySelector("[data-finance-feedback='empty']"),
    ).toHaveClass("w-full", "flex-col");

    rerender(<SavingState text="Saving" context="accounts" compact />);
    expect(
      document.querySelector("[data-finance-state='saving']"),
    ).toHaveAttribute("data-finance-compact", "true");
    expect(document.querySelector("[data-finance-state='saving']")).toHaveClass(
      "w-full",
      "aspect-[600/136]",
    );
    expect(screen.getByText("Saving")).toHaveClass("text-center", "pt-3");
  });

  it("uses the full-width visual by default for loading", () => {
    render(<LoadingState text="Loading accounts" context="accounts" />);

    expect(
      document.querySelector("[data-finance-state='loading']"),
    ).toHaveAttribute("data-finance-compact", "false");
    expect(screen.getByRole("status")).toHaveClass("min-h-48", "flex-col");
  });

  it("uses focused scenes for transfers and reminders", () => {
    const { rerender } = render(
      <LoadingState text="Loading transfers" context="transfers" />,
    );
    expect(
      document.querySelector("[data-finance-scene='transfers']"),
    ).toBeInTheDocument();

    rerender(<EmptyState text="No reminders" context="reminders" />);
    expect(
      document.querySelector("[data-finance-scene='reminders']"),
    ).toBeInTheDocument();
    expect(
      document.querySelector("[data-finance-context='reminders'] img"),
    ).toHaveAttribute("src", expect.stringContaining("wallet-empty"));
  });

  it.each(contexts)("renders a dedicated %s scene", (context) => {
    render(<EmptyState text="Empty" context={context} />);

    expect(
      document.querySelector(`[data-finance-scene='${context}']`),
    ).toBeInTheDocument();
  });

  it("uses distinct assets for loading, empty and error states", () => {
    const { rerender } = render(
      <LoadingState text="Loading" context="analytics" />,
    );
    expect(document.querySelector("img")).toHaveAttribute(
      "src",
      expect.stringContaining("wallet-loading"),
    );

    rerender(<EmptyState text="Empty" context="analytics" />);
    expect(document.querySelector("img")).toHaveAttribute(
      "src",
      expect.stringContaining("wallet-empty"),
    );

    rerender(<ErrorState text="Error" context="analytics" />);
    expect(document.querySelector("img")).toHaveAttribute(
      "src",
      expect.stringContaining("wallet-error"),
    );
  });
});
