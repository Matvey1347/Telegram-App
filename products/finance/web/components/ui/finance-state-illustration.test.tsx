import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  SavingState,
  SyncingState,
  WaitingState,
} from "@consumer-finance/web/components/ui/finance-surfaces";
import { FinanceStateIllustration } from "@consumer-finance/web/components/ui/finance-state-illustration";
import { FinanceVisualContextProvider } from "@consumer-finance/web/components/ui/finance-visual-context";

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
    "renders the %s feedback copy and a light Groshly illustration when requested",
    (state, State) => {
      render(<><State text={`${state} copy`} context="transfers" /><FinanceStateIllustration state={state} context="transfers" /></>);

      expect(screen.getByText(`${state} copy`)).toBeInTheDocument();
      expect(
        document.querySelector(
          `[data-finance-state='${state}'][data-finance-context='transfers']`,
        ),
      ).toBeInTheDocument();
      expect(
        document.querySelector(`[data-finance-state='${state}']`),
      ).toHaveAttribute("data-finance-visual-tone", "groshly-light");
    },
  );

  it("inherits the active section and keeps errors assertive", () => {
    render(
      <FinanceVisualContextProvider value="investments">
        <ErrorState text="Could not load investments" />
        <LoadingState text="Loading investments" />
      </FinanceVisualContextProvider>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not load investments",
    );
    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");
    expect(screen.getByRole("status").querySelector("[data-finance-context='investments']")).toBeInTheDocument();
  });

  it("keeps the visual context while using focused SVG scenes", () => {
    const { rerender } = render(
      <FinanceStateIllustration state="empty" context="transfers" />,
    );
    expect(
      document.querySelector("[data-finance-context='transfers']"),
    ).toHaveAttribute("data-finance-visual-kind", "flow");

    rerender(<FinanceStateIllustration state="empty" context="analytics" />);
    expect(
      document.querySelector("[data-finance-context='analytics']"),
    ).toHaveAttribute("data-finance-visual-kind", "growth");
  });

  it("keeps every illustration full-width with its copy below it", () => {
    const { rerender } = render(
      <><FinanceStateIllustration state="empty" context="transfers" /><EmptyState text="No transfers" /></>,
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

    rerender(<><FinanceStateIllustration state="saving" context="accounts" compact /><SavingState text="Saving" compact /></>);
    expect(
      document.querySelector("[data-finance-state='saving']"),
    ).toHaveAttribute("data-finance-compact", "true");
    expect(document.querySelector("[data-finance-state='saving']")).toHaveClass(
      "w-full",
      "aspect-[600/136]",
    );
    expect(screen.getByText("Saving")).toHaveClass("text-center", "pt-3");
  });

  it("uses the full-width universal money loader immediately", () => {
    render(<LoadingState text="Loading accounts" context="accounts" />);

    expect(
      document.querySelector("[data-finance-money-loader]"),
    ).toHaveAttribute("data-finance-compact", "false");
    expect(
      document.querySelector("[data-finance-amount-reel]"),
    ).toBeInTheDocument();
    expect(
      document.querySelector("[data-finance-scene='accounts']"),
    ).toBeNull();
    expect(screen.getByRole("status")).toHaveClass("min-h-48", "flex-col");
  });

  it("uses one money loader only while the feedback surface is loading", () => {
    const { rerender } = render(
      <LoadingState text="Loading transfers" context="transfers" />,
    );
    expect(
      document.querySelector(
        "[data-finance-money-loader][data-finance-context='transfers']",
      ),
    ).toBeInTheDocument();

    rerender(<EmptyState text="No reminders" context="reminders" />);
    expect(screen.getByRole("status")).toHaveTextContent("No reminders");
    expect(document.querySelector("[data-finance-money-loader]")).toBeNull();
    expect(document.querySelector("[data-finance-scene='reminders']")).toBeNull();
  });

  it.each(contexts)("renders a dedicated %s scene", (context) => {
    render(<FinanceStateIllustration state="empty" context={context} />);

    expect(
      document.querySelector(`[data-finance-scene='${context}']`),
    ).toBeInTheDocument();
  });

  it.each(contexts)(
    "uses the universal money loader for %s loading",
    (context) => {
      render(<LoadingState text="Loading" context={context} />);

      expect(
        document.querySelector(
          `[data-finance-money-loader][data-finance-context='${context}']`,
        ),
      ).toBeInTheDocument();
      expect(
        document.querySelector(`[data-finance-scene='${context}']`),
      ).toBeNull();
    },
  );

  it("uses a money reel for loading and distinct marks for empty and error states", () => {
    const { rerender } = render(
      <LoadingState text="Loading" context="analytics" />,
    );
    expect(
      document.querySelector("[data-finance-amount-reel]"),
    ).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();

    rerender(<FinanceStateIllustration state="empty" context="analytics" />);
    expect(
      document.querySelector("[data-finance-state-mark='empty']"),
    ).toBeInTheDocument();

    rerender(<FinanceStateIllustration state="error" context="analytics" />);
    expect(
      document.querySelector("[data-finance-state-mark='error']"),
    ).toBeInTheDocument();
  });
});
