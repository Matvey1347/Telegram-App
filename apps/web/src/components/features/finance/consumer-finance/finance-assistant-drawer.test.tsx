import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ConsumerFinanceAssistantMessageResult } from "@telegram-system/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { consumerFinanceAssistantApi, FinanceAssistantRequestError } from "@/lib/features/finance/consumer-finance-assistant-api";
import { FinanceAssistantDrawer } from "./finance-assistant-drawer";

vi.mock("@/lib/features/finance/consumer-finance-assistant-api", () => ({
  FinanceAssistantRequestError: class FinanceAssistantRequestError extends Error {
    constructor(message: string, readonly code?: string) { super(message); }
  },
  consumerFinanceAssistantApi: {
    message: vi.fn(),
    ask: vi.fn(),
    proposeText: vi.fn(),
    proposeFile: vi.fn(),
    proposeFiles: vi.fn(),
    confirm: vi.fn(),
    cancel: vi.fn(),
    revise: vi.fn(),
  },
}));

vi.mock("@/lib/features/finance/consumer-finance-ledger-api", () => ({
  consumerFinanceLedgerApi: {
    accounts: vi.fn().mockResolvedValue([{
      id: "account-1", name: "Card", currency: "PLN",
      iconPresentation: { type: "unicode", value: "💳" },
    }]),
    categories: vi.fn().mockResolvedValue([{
      id: "category-1", name: "Restaurants", type: "EXPENSE",
      iconPresentation: { type: "unicode", value: "🍽️" },
    }]),
  },
}));

vi.mock("@/lib/features/finance/consumer-finance-planning-api", () => ({
  consumerFinancePlanningApi: {
    entitlements: vi.fn().mockResolvedValue({
      tier: "FREE",
      capabilities: [],
      usage: [
        {
          feature: "AI_INPUT",
          used: 0,
          limit: 10,
          remaining: 10,
          resetAt: null,
        },
      ],
      activeUntil: null,
      cancelAtPeriodEnd: false,
    }),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("FinanceAssistantDrawer", () => {
  it("grows the localized message field to four lines and then scrolls", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <FinanceAssistantDrawer
          botId="bot"
          locale="uk"
          open
          onOpenChange={vi.fn()}
          onNavigate={vi.fn()}
        />
      </QueryClientProvider>,
    );

    const composer = screen.getByLabelText(
      "Повідомлення Джаврису…",
    ) as HTMLTextAreaElement;
    Object.defineProperty(composer, "scrollHeight", {
      configurable: true,
      value: 140,
    });

    fireEvent.change(composer, {
      target: { value: "Один\nДва\nТри\nЧотири\nПʼять" },
    });

    await waitFor(() => {
      expect(composer).toHaveStyle({ height: "104px", overflowY: "auto" });
    });
    expect(composer).not.toHaveAttribute("wrap", "off");
    expect(composer).toHaveClass("whitespace-pre-wrap", "break-words");
    expect(composer).toHaveClass("focus:!ring-0", "py-3");
    expect(composer.parentElement).not.toHaveClass("focus-within:ring-2");
    expect(screen.getByText(/Джаврис лише готує пропозиції/u)).toHaveClass(
      "text-center",
    );
  });

  it("renders the assistant as an inline page without a close control", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <FinanceAssistantDrawer
          botId="bot"
          locale="en"
          open
          presentation="page"
          onOpenChange={vi.fn()}
          onNavigate={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("region", { name: "Jarvis" })).toHaveAttribute(
      "data-finance-assistant-presentation",
      "page",
    );
    expect(
      screen.queryByRole("button", { name: "Close Jarvis" }),
    ).not.toBeInTheDocument();
  });

  it("answers questions without writing an operation", async () => {
    vi.mocked(consumerFinanceAssistantApi.message).mockResolvedValue({
      kind: "ANSWER",
      message: "Optional spending is 20% of expenses.",
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <FinanceAssistantDrawer
          botId="bot"
          locale="en"
          open
          onOpenChange={vi.fn()}
          onNavigate={vi.fn()}
        />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByLabelText("Message Jarvis…"), {
      target: { value: "Can I afford a new phone?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(
      await screen.findByText("Optional spending is 20% of expenses."),
    ).toBeInTheDocument();
    expect(consumerFinanceAssistantApi.message).toHaveBeenCalledWith(
      "bot",
      {
        text: "Can I afford a new phone?",
        history: [],
      },
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        onDelta: expect.any(Function),
      }),
    );
  });

  it("renders Jarvis text before the final result arrives", async () => {
    let finish!: (result: ConsumerFinanceAssistantMessageResult) => void;
    vi.mocked(consumerFinanceAssistantApi.message).mockImplementation(
      async (_botId, _input, options) => {
        options?.onDelta?.("I can ");
        await Promise.resolve();
        options?.onDelta?.("help now");
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <FinanceAssistantDrawer
          botId="bot"
          locale="en"
          open
          onOpenChange={vi.fn()}
          onNavigate={vi.fn()}
        />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByLabelText("Message Jarvis…"), {
      target: { value: "Help me" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("I can help now")).toBeInTheDocument();
    expect(screen.queryByText("Thinking…")).not.toBeInTheDocument();

    await act(async () => {
      finish({ kind: "ANSWER", message: "I can help now." });
    });
    expect(await screen.findByText("I can help now.")).toBeInTheDocument();
  });

  it("can stop an in-flight request without sending a second fallback request", async () => {
    let signal: AbortSignal | undefined;
    vi.mocked(consumerFinanceAssistantApi.message).mockImplementation((_botId, _input, options) => {
      signal = options?.signal;
      return new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
    });
    render(<QueryClientProvider client={new QueryClient()}><FinanceAssistantDrawer botId="bot" locale="en" open onOpenChange={vi.fn()} onNavigate={vi.fn()} /></QueryClientProvider>);
    fireEvent.change(screen.getByLabelText("Message Jarvis…"), { target: { value: "Spent 9 PLN" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop" }));
    await waitFor(() => expect(signal?.aborted).toBe(true));
    expect(consumerFinanceAssistantApi.proposeText).not.toHaveBeenCalled();
  });

  it("identifies a provider outage without blaming the user's entry or silently retrying through another endpoint", async () => {
    vi.mocked(consumerFinanceAssistantApi.message).mockRejectedValue(new FinanceAssistantRequestError("Finance assistant request failed", "BadGatewayException"));
    render(<QueryClientProvider client={new QueryClient()}><FinanceAssistantDrawer botId="bot" locale="en" open onOpenChange={vi.fn()} onNavigate={vi.fn()} /></QueryClientProvider>);
    fireEvent.change(screen.getByLabelText("Message Jarvis…"), { target: { value: "Spent 9 PLN" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("The AI service is temporarily unavailable. Nothing was recorded; please try again.")).toBeInTheDocument();
    expect(consumerFinanceAssistantApi.proposeText).not.toHaveBeenCalled();
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
            accountId: "account-1",
            categoryId: "category-1",
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
        <FinanceAssistantDrawer
          botId="bot"
          locale="en"
          open
          onOpenChange={vi.fn()}
          onNavigate={vi.fn()}
        />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByLabelText("Message Jarvis…"), {
      target: { value: "Paid 12 PLN for coffee" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(
      await screen.findByText("Check before recording"),
    ).toBeInTheDocument();
    expect(await screen.findAllByText("Coffee")).toHaveLength(2);
    expect(screen.getAllByText("Restaurants").length).toBeGreaterThan(0);
    expect(consumerFinanceAssistantApi.confirm).not.toHaveBeenCalled();
    vi.mocked(consumerFinanceAssistantApi.revise).mockResolvedValue({ updated: true });
    fireEvent.click(screen.getAllByRole("button", { name: "Edit transaction" })[0]);
    fireEvent.change(screen.getByDisplayValue("Coffee"), { target: { value: "Coffee edited" } });
    fireEvent.click(screen.getByRole("button", { name: "Save transaction" }));
    await waitFor(() => expect(consumerFinanceAssistantApi.revise).toHaveBeenCalledWith(
      "bot", "token", [expect.objectContaining({ description: "Coffee edited", accountId: "account-1", categoryId: "category-1" })], undefined,
    ));
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

  it("removes one suggested transaction without recording either transaction", async () => {
    vi.mocked(consumerFinanceAssistantApi.message).mockResolvedValue({
      kind: "PROPOSAL", message: "", proposal: {
        token: "token", operations: ["Coffee", "Lunch"].map((description) => ({
          type: "EXPENSE" as const, amount: "9", currency: "PLN", description,
          occurredAt: "2026-09-12T12:00:00.000Z", accountId: "account-1",
          categoryId: "category-1", accountName: "Card", categoryName: "Restaurants",
        })),
      },
    });
    vi.mocked(consumerFinanceAssistantApi.revise).mockResolvedValue({ updated: true });
    render(<QueryClientProvider client={new QueryClient()}><FinanceAssistantDrawer botId="bot" locale="en" open onOpenChange={vi.fn()} onNavigate={vi.fn()} /></QueryClientProvider>);
    fireEvent.change(screen.getByLabelText("Message Jarvis…"), { target: { value: "Coffee and lunch" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findAllByText("Coffee")).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete transaction" })[0]);
    await waitFor(() => expect(consumerFinanceAssistantApi.revise).toHaveBeenCalledWith(
      "bot", "token", [expect.objectContaining({ description: "Lunch" })], [1],
    ));
    expect(consumerFinanceAssistantApi.confirm).not.toHaveBeenCalled();
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
          open
          onOpenChange={vi.fn()}
          onNavigate={onNavigate}
        />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByLabelText("Message Jarvis…"), {
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

  it("previews multiple receipt images and sends them together for review", async () => {
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi
          .fn()
          .mockReturnValueOnce("blob:receipt-front")
          .mockReturnValueOnce("blob:receipt-back"),
        revokeObjectURL: vi.fn(),
      }),
    );
    vi.mocked(consumerFinanceAssistantApi.proposeFiles).mockResolvedValue({
      token: "media-token",
      operations: [],
    });
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <FinanceAssistantDrawer
          botId="bot"
          locale="en"
          open
          onOpenChange={vi.fn()}
          onNavigate={vi.fn()}
        />
      </QueryClientProvider>,
    );
    const front = new File(["front"], "receipt-front.png", {
      type: "image/png",
    });
    const back = new File(["back"], "receipt-back.png", {
      type: "image/png",
    });
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [front, back] },
    });
    expect(
      screen.getByRole("img", { name: "receipt-front.png" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "receipt-back.png" }),
    ).toBeInTheDocument();
    expect(consumerFinanceAssistantApi.proposeFiles).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(consumerFinanceAssistantApi.proposeFiles).toHaveBeenCalledWith(
        "bot",
        [front, back],
      ),
    );
  });

  it("keeps Free users on Jarvis and explains the voice limit inline", async () => {
    const onNavigate = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <FinanceAssistantDrawer
          botId="bot"
          locale="en"
          open
          onOpenChange={vi.fn()}
          onNavigate={onNavigate}
        />
      </QueryClientProvider>,
    );
    const voiceButton = await screen.findByRole("button", {
      name: "Voice messages require Pro or Ultra",
    });
    expect(
      await screen.findByText("Talk to Jarvis instead of typing"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss plan offer" }));
    expect(
      screen.queryByText("Talk to Jarvis instead of typing"),
    ).not.toBeInTheDocument();
    expect(window.localStorage.getItem("finance-jarvis-voice-offer:bot")).toBe(
      "dismissed",
    );
    fireEvent.click(voiceButton);
    expect(onNavigate).not.toHaveBeenCalled();
    expect(
      screen.getByText("Voice messages require Pro or Ultra"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Upgrade plan" }));
    expect(onNavigate).toHaveBeenCalledWith("billing");
  });
});
