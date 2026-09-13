import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { consumerFinanceAssistantApi } from "@/lib/features/finance/consumer-finance-assistant-api";
import { FinanceAssistantDrawer } from "./finance-assistant-drawer";

vi.mock("@/lib/features/finance/consumer-finance-assistant-api", () => ({
  consumerFinanceAssistantApi: {
    message: vi.fn(),
    ask: vi.fn(),
    proposeText: vi.fn(),
    proposeFile: vi.fn(),
    confirm: vi.fn(),
    cancel: vi.fn(),
  },
}));

beforeEach(() => vi.clearAllMocks());

describe("FinanceAssistantDrawer", () => {
  it("answers questions without writing an operation", async () => {
    vi.mocked(consumerFinanceAssistantApi.message).mockResolvedValue({
      kind: "ANSWER",
      message: "Optional spending is 20% of expenses.",
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <FinanceAssistantDrawer botId="bot" locale="en" onNavigate={vi.fn()} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByLabelText("Open finance assistant"));
    fireEvent.change(screen.getByLabelText(/For example/), {
      target: { value: "Can I afford a new phone?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(
      await screen.findByText("Optional spending is 20% of expenses."),
    ).toBeInTheDocument();
    expect(consumerFinanceAssistantApi.message).toHaveBeenCalledWith("bot", {
      text: "Can I afford a new phone?",
      history: [],
    });
  });

  it("shows an AI proposal and writes only after confirmation", async () => {
    vi.mocked(consumerFinanceAssistantApi.message).mockResolvedValue({
      kind: "PROPOSAL",
      message: "I prepared this as an optional shared expense.",
      proposal: {
        token: "token",
        operations: [
          {
            type: "EXPENSE",
            amount: "12",
            economicAmount: "3",
            purpose: "ORDINARY",
            necessity: "DISCRETIONARY",
            currency: "PLN",
            description: "Coffee",
            occurredAt: "2026-09-12T12:00:00.000Z",
            accountName: "Card",
            categoryName: "Restaurants",
          },
        ],
      },
    });
    vi.mocked(consumerFinanceAssistantApi.confirm).mockResolvedValue({
      transactionIds: ["transaction-1"],
      duplicate: false,
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <FinanceAssistantDrawer botId="bot" locale="en" onNavigate={vi.fn()} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByLabelText("Open finance assistant"));
    fireEvent.change(screen.getByLabelText(/For example/), {
      target: { value: "Paid 12 PLN for coffee" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(
      await screen.findByText("Check before recording"),
    ).toBeInTheDocument();
    expect(screen.getByText("zł 3.00")).toBeInTheDocument();
    expect(screen.getByText("Ordinary income or expense")).toBeInTheDocument();
    expect(screen.getByText("Optional")).toBeInTheDocument();
    expect(consumerFinanceAssistantApi.confirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(consumerFinanceAssistantApi.confirm).toHaveBeenCalledWith(
        "bot",
        "token",
      ),
    );
    expect(
      await screen.findByText("Recorded successfully."),
    ).toBeInTheDocument();
  });

  it("opens the Finance function selected by the assistant", async () => {
    const onNavigate = vi.fn();
    vi.mocked(consumerFinanceAssistantApi.message).mockResolvedValue({
      kind: "GUIDANCE",
      message: "This belongs in Debts because the money is still owed to you.",
      recommendedScreen: "debts",
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <FinanceAssistantDrawer
          botId="bot"
          locale="en"
          onNavigate={onNavigate}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByLabelText("Open finance assistant"));
    fireEvent.change(screen.getByLabelText(/For example/), {
      target: { value: "A friend still owes me 25 PLN" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(
      await screen.findByText(
        "This belongs in Debts because the money is still owed to you.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Open recommended section" }),
    );
    expect(onNavigate).toHaveBeenCalledWith("debts");
  });
});
