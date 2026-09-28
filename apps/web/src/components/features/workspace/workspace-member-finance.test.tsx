import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { accountsApi, memberFinanceApi, workspaceMembersApi } from "@/lib/api";
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

function renderFinance(
  canManage: boolean,
  financeSummary: typeof summary = summary,
) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <WorkspaceMemberFinance
        member={member}
        summary={financeSummary}
        canManage={canManage}
      />
    </QueryClientProvider>,
  );
}

describe("WorkspaceMemberFinance", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(accountsApi, "list").mockResolvedValue([] as never);
    vi.spyOn(memberFinanceApi, "details").mockResolvedValue({
      timeline: [
        {
          id: "auto-reinvestment-1",
          type: "AUTO_REINVESTMENT",
          date: "2026-09-13T10:00:00.000Z",
          amount: 75,
          title: "Telegram ad sale payment",
        },
        {
          id: "external-investment-1",
          type: "EXTERNAL_CONTRIBUTION",
          date: "2026-09-12T10:00:00.000Z",
          amount: 300,
          title: "Opening capital",
        },
      ],
    } as never);
    vi.spyOn(workspaceMembersApi, "investments").mockResolvedValue([
      {
        id: "transaction-1",
        accountId: "account-1",
        account: {
          id: "account-1",
          name: "Main",
          currency: "UAH",
          iconPresentation: { type: "unicode", value: "💳" },
        },
        type: "income",
        amount: 300,
        currency: "UAH",
        exchangeRateToPrimary: 1,
        amountInPrimaryCurrency: 300,
        category: "Investment",
        categoryRef: {
          id: "category-1",
          name: "Investment",
          type: "income",
          isSystem: true,
          key: "investment",
          iconPresentation: { type: "unicode", value: "📈" },
        },
        description: "Initial investment",
        date: "2026-09-11T10:00:00.000Z",
      },
    ] as never);
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
    expect(await screen.findByText("Investment transactions")).toBeInTheDocument();
    expect(await screen.findByText("Initial investment")).toBeInTheDocument();
    expect(screen.getAllByText("📈")).not.toHaveLength(0);
    expect(screen.getByText("💳")).toBeInTheDocument();
    expect(workspaceMembersApi.investments).toHaveBeenCalledWith("member-1");
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
    await user.click(screen.getByRole("button", { name: "Pay salary" }));
    expect(screen.getByText(/Available commission:/)).toBeInTheDocument();
    expect(screen.queryByText("Investment transactions")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Withdraw reinvest" }),
    ).toBeNull();
  });

  it("loads only this member’s reinvestment sources when the reinvestment tab opens", async () => {
    const user = userEvent.setup();
    renderFinance(false);
    await user.click(
      screen.getByRole("button", { name: /Commission payable/ }),
    );

    await user.click(screen.getByRole("tab", { name: "Reinvestments" }));

    expect(await screen.findByText("Reinvestment sources")).toBeInTheDocument();
    expect(await screen.findByText("Telegram ad sale payment")).toBeInTheDocument();
    expect(screen.queryByText("Opening capital")).toBeNull();
    expect(memberFinanceApi.details).toHaveBeenCalledWith("member-1");
  });

  it("does not render a zero commission-payable value", () => {
    renderFinance(false, {
      ...summary,
      commissionPayable: 0,
      investments: { ...summary.investments, total: 1_000 },
    });

    expect(screen.queryByText("Commission payable")).toBeNull();
    expect(screen.getByText(/Invested 400/)).toBeInTheDocument();
  });
});
