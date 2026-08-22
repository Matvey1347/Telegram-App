import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ConsumerFinanceDashboard } from "@telegram-system/shared";
import { FinanceDashboard } from "./finance-dashboard";

const dashboard: ConsumerFinanceDashboard = {
  profile: {
    id: "profile-1",
    defaultCurrency: "USD",
    timezone: "UTC",
    locale: "en",
  },
  stats: {
    currency: "USD",
    income: "0",
    expense: "0",
    net: "0",
    totalBalance: {
      amount: "0",
      currency: "USD",
      includedAccountCount: 0,
      excludedAccounts: [],
    },
    categories: [],
    accounts: [],
  },
  limits: [],
  goal: null,
  recent: [],
};

describe("FinanceDashboard actions", () => {
  it("does not decorate the expense summary with a minus icon", () => {
    const { container } = render(
      <FinanceDashboard
        data={dashboard}
        locale="en"
        timezone="UTC"
        onNavigate={vi.fn()}
        onAction={vi.fn()}
        surface="telegram"
      />,
    );

    expect(container.querySelector(".lucide-circle-minus")).toBeNull();
  });

  it.each([
    ["Add expense", "expense"],
    ["Add income", "income"],
    ["Transfers", "transfer"],
  ] as const)("launches the real %s workflow", (label, action) => {
    const onAction = vi.fn();
    render(
      <FinanceDashboard
        data={dashboard}
        locale="en"
        timezone="UTC"
        onNavigate={vi.fn()}
        onAction={onAction}
        surface="telegram"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: label }));

    expect(onAction).toHaveBeenCalledWith(action);
  });
});
