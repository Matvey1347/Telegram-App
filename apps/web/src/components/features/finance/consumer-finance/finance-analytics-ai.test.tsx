import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FinanceAnalyticsAi } from "./finance-analytics-ai";

const api = vi.hoisted(() => ({
  entitlements: vi.fn(),
  askFinance: vi.fn(),
}));
vi.mock("@/lib/features/finance/consumer-finance-api", () => ({
  consumerFinanceApi: api,
}));

function renderAi(onUpgrade = vi.fn()) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <FinanceAnalyticsAi
        botId="bot-1"
        locale="en"
        query={{ period: "CURRENT_MONTH" }}
        enabled
        onUpgrade={onUpgrade}
      />
    </QueryClientProvider>,
  );
  return onUpgrade;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FinanceAnalyticsAi", () => {
  it("shows only an upgrade action for Free without sending an AI request", async () => {
    api.entitlements.mockResolvedValue({ capabilities: [] });
    const onUpgrade = renderAi();

    fireEvent.click(await screen.findByRole("button", { name: "View plans" }));

    expect(onUpgrade).toHaveBeenCalledOnce();
    expect(api.askFinance).not.toHaveBeenCalled();
  });

  it("calls AI only after an Ultimate user explicitly submits a question", async () => {
    api.entitlements.mockResolvedValue({
      capabilities: ["FINANCE_HISTORY_QA"],
    });
    api.askFinance.mockResolvedValue({
      answer: "Generated answer",
      suggestedQuestions: [],
      facts: [{ label: "income", amount: "100", currency: "UAH" }],
    });
    renderAi();

    const input = await screen.findByLabelText("Ask AI about this period");
    expect(api.askFinance).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "What changed?" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Generate AI interpretation" }),
    );

    await waitFor(() =>
      expect(api.askFinance).toHaveBeenCalledWith("bot-1", {
        question: "What changed?",
        period: "CURRENT_MONTH",
      }),
    );
    expect(await screen.findByText("Generated answer")).toBeInTheDocument();
    expect(
      screen.getByText("Deterministic facts supplied to AI"),
    ).toBeInTheDocument();
  });
});
