import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { accountsApi, memberFinanceApi } from "@/lib/api";
import { WorkspaceMemberFinance } from "./workspace-member-finance";

const member = {
  id: "member-1",
  user: { id: "user-1", name: "Seller", email: "seller@example.com" },
} as never;
const summary = {
  memberId: "member-1",
  primaryCurrency: "UAH",
  commissionEarned: 100,
  commissionSettled: 20,
  commissionPayable: 80,
  investments: {
    external: 300,
    salary: 100,
    investorEarnings: 600,
    principal: 400,
    total: 1_000,
  },
};

function renderFinance(canManage: boolean) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <WorkspaceMemberFinance
        member={member}
        summary={summary}
        canManage={canManage}
      />
    </QueryClientProvider>,
  );
}

describe("WorkspaceMemberFinance", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(memberFinanceApi, "details").mockResolvedValue({
      ...summary,
      member: { id: "member-1", name: "Seller", email: "seller@example.com" },
      timeline: [
        {
          id: "commission:1",
          type: "COMMISSION_EARNED",
          date: "2026-09-12T10:00:00.000Z",
          amount: 100,
          title: "Ad sale",
        },
        {
          id: "investment:1",
          type: "EXTERNAL_CONTRIBUTION",
          date: "2026-09-11T10:00:00.000Z",
          amount: 300,
          title: "Initial investment",
        },
      ],
    });
    vi.spyOn(accountsApi, "list").mockResolvedValue([] as never);
  });

  it("shows invested and reinvested balances without duplicating the total", async () => {
    const user = userEvent.setup();
    renderFinance(false);

    expect(screen.getByText("Commission payable")).toBeInTheDocument();
    expect(screen.getByText(/Invested/)).toHaveTextContent("400");
    expect(screen.getByText(/Reinvested/)).toHaveTextContent("600");
    expect(screen.queryByText(/Total investment/)).toBeNull();
    await user.click(
      screen.getByRole("button", { name: /Commission payable/ }),
    );
    expect(await screen.findByText("Commission earned")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open External investment in Finance" }),
    ).toHaveAttribute("href", "/finance#transactions");
    expect(screen.queryByRole("button", { name: "Pay salary" })).toBeNull();
  });

  it("exposes salary decisions only to an owner", async () => {
    const user = userEvent.setup();
    renderFinance(true);
    await user.click(
      screen.getByRole("button", { name: /Commission payable/ }),
    );

    expect(
      screen.getByRole("button", { name: "Pay salary" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Invest salary" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Withdraw reinvest" }),
    ).toBeNull();
  });
});
