import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ConsumerFinanceRegularPayment,
  ConsumerFinanceRegularPaymentConfirmation,
} from "@telegram-system/shared";
import { FinanceRegularPayments } from "./finance-regular-payments";

const api = vi.hoisted(() => ({
  regularPayments: vi.fn(),
  createRegularPayment: vi.fn(),
  updateRegularPayment: vi.fn(),
  pauseRegularPayment: vi.fn(),
  resumeRegularPayment: vi.fn(),
  cancelRegularPayment: vi.fn(),
  confirmRegularPayment: vi.fn(),
  applyOccurrenceAmount: vi.fn(),
  regularPaymentRevisions: vi.fn(),
  accounts: vi.fn(),
  categories: vi.fn(),
}));
vi.mock("@/lib/features/finance/consumer-finance-obligations-api", () => ({
  consumerFinanceObligationsApi: api,
}));
vi.mock("@/lib/features/finance/consumer-finance-ledger-api", () => ({
  consumerFinanceLedgerApi: {
    accounts: api.accounts,
    categories: api.categories,
  },
}));

const payment: ConsumerFinanceRegularPayment = {
  id: "rent",
  name: "Rent",
  amount: "100",
  currency: "USD",
  accountId: "cash",
  account: {
    id: "cash",
    name: "Cash wallet",
    currency: "USD",
    iconPresentation: { type: "unicode", value: "💵" },
  },
  categoryId: "home",
  category: {
    id: "home",
    name: "Home",
    type: "EXPENSE",
    iconPresentation: { type: "unicode", value: "🏠" },
  },
  recurrence: "MONTHLY",
  nextOccurrenceAt: "2026-09-08T08:00:00.000Z",
  scheduleTimezone: "UTC",
  note: "September",
  status: "ACTIVE",
  isDue: true,
  version: 7,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};
const confirmation: ConsumerFinanceRegularPaymentConfirmation = {
  regularPayment: { ...payment, version: 8 },
  occurrence: {
    id: "occurrence",
    recurringPaymentId: "rent",
    transactionId: "transaction",
    configVersion: 7,
    scheduledFor: payment.nextOccurrenceAt,
    scheduledAmount: "100",
    paidAmount: "125",
    currency: "USD",
    confirmedAt: "2026-09-08T09:00:00.000Z",
  },
  transaction: {
    id: "transaction",
    accountId: "cash",
    type: "EXPENSE",
    purpose: "ORDINARY",
    amount: "125",
    currency: "USD",
    occurredAt: "2026-09-08T09:00:00.000Z",
  },
  duplicate: false,
  futureAmountUpdateRequired: true,
};

function renderPayments(
  props: Partial<React.ComponentProps<typeof FinanceRegularPayments>> = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <FinanceRegularPayments
          botId="bot"
          locale="en"
          timezone="UTC"
          {...props}
        />
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.regularPayments.mockResolvedValue({ items: [payment], nextCursor: null });
  api.accounts.mockResolvedValue([]);
  api.categories.mockResolvedValue([]);
  api.regularPaymentRevisions.mockResolvedValue({
    items: [],
    nextCursor: null,
  });
});

describe("FinanceRegularPayments", () => {
  it("uses embedded list summaries and loads editor references together", async () => {
    renderPayments();

    expect(await screen.findByText("Rent")).toBeInTheDocument();
    expect(screen.getByText(/Cash wallet/)).toBeInTheDocument();
    expect(screen.getByText("Due · 9/8/2026")).toHaveClass("text-amber-300");
    expect(api.accounts).not.toHaveBeenCalled();
    expect(api.categories).not.toHaveBeenCalled();
    expect(api.regularPaymentRevisions).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Add regular payment" }),
    );
    await waitFor(() => {
      expect(api.accounts).toHaveBeenCalledOnce();
      expect(api.categories).toHaveBeenCalledOnce();
    });
  });

  it("loads revision history only after the selected-row action", async () => {
    renderPayments();
    await screen.findByText("Rent");

    expect(api.regularPaymentRevisions).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Revision history" }));
    await waitFor(() =>
      expect(api.regularPaymentRevisions).toHaveBeenCalledWith("bot", "rent", {
        cursor: undefined,
        limit: 30,
      }),
    );
    expect(await screen.findByText("No revisions yet.")).toBeInTheDocument();
  });

  it("renders localized configuration and status snapshots in revision history", async () => {
    api.regularPaymentRevisions.mockResolvedValue({
      items: [
        {
          id: "revision-2",
          version: 2,
          kind: "UPDATED",
          name: "Rent after review",
          amount: "400",
          currency: "USD",
          accountId: "cash",
          accountName: "Cash wallet",
          categoryId: "home",
          categoryName: "Home",
          categoryKey: "home",
          recurrence: "MONTHLY",
          nextOccurrenceAt: "2026-10-15T00:00:00.000Z",
          scheduleTimezone: "UTC",
          note: "New amount and day",
          status: "PAUSED",
          effectiveAt: "2026-09-09T08:00:00.000Z",
        },
      ],
      nextCursor: null,
    });
    renderPayments();
    fireEvent.click(
      await screen.findByRole("button", { name: "Revision history" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Updated")).toBeInTheDocument();
    expect(within(dialog).getByText("Rent after review")).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Monthly · Scheduled for 10\/15\/2026/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Status: Paused · Category: Home/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Note: New amount and day/),
    ).toBeInTheDocument();
  });

  it("pauses, resumes, and cancels through the exact status endpoints", async () => {
    const paused = { ...payment, status: "PAUSED" as const, isDue: false };
    api.regularPayments.mockImplementation(
      (_botId: string, query: { status?: string }) =>
        Promise.resolve({
          items: [query.status === "PAUSED" ? paused : payment],
          nextCursor: null,
        }),
    );
    api.pauseRegularPayment.mockResolvedValue(paused);
    api.resumeRegularPayment.mockResolvedValue({ ...payment, isDue: false });
    api.cancelRegularPayment.mockResolvedValue({
      ...payment,
      status: "CANCELED",
      isDue: false,
    });
    renderPayments();

    fireEvent.click(await screen.findByRole("button", { name: "Pause" }));
    await waitFor(() =>
      expect(api.pauseRegularPayment).toHaveBeenCalledWith("bot", "rent"),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Paused" }));
    fireEvent.click(await screen.findByRole("button", { name: "Resume" }));
    await waitFor(() =>
      expect(api.resumeRegularPayment).toHaveBeenCalledWith("bot", "rent"),
    );

    fireEvent.click(screen.getByRole("tab", { name: "Active" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Cancel payment" }),
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByPlaceholderText("Rent"), {
      target: { value: "Rent" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Cancel payment" }),
    );
    await waitFor(() =>
      expect(api.cancelRegularPayment).toHaveBeenCalledWith("bot", "rent"),
    );
  });

  it("confirms a custom amount and No performs no apply-amount write", async () => {
    api.confirmRegularPayment.mockResolvedValue(confirmation);
    renderPayments();
    fireEvent.click(
      await screen.findByRole("button", { name: "Change amount" }),
    );
    fireEvent.change(screen.getByDisplayValue("100"), {
      target: { value: "125" },
    });
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Confirm payment",
      }),
    );

    await waitFor(() =>
      expect(api.confirmRegularPayment).toHaveBeenCalledWith("bot", "rent", {
        expectedOccurrenceAt: payment.nextOccurrenceAt,
        expectedVersion: payment.version,
        amount: "125",
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "No, keep the scheduled amount",
      }),
    );
    expect(api.applyOccurrenceAmount).not.toHaveBeenCalled();
  });

  it("applies the confirmed occurrence amount with the returned version", async () => {
    api.confirmRegularPayment.mockResolvedValue(confirmation);
    api.applyOccurrenceAmount.mockResolvedValue({
      ...confirmation.regularPayment,
      amount: "125",
      version: 9,
    });
    renderPayments();
    fireEvent.click(
      await screen.findByRole("button", { name: "Change amount" }),
    );
    fireEvent.change(screen.getByDisplayValue("100"), {
      target: { value: "125" },
    });
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Confirm payment",
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Yes, update future payments",
      }),
    );

    await waitFor(() =>
      expect(api.applyOccurrenceAmount).toHaveBeenCalledWith(
        "bot",
        "rent",
        "occurrence",
        { expectedVersion: 8 },
      ),
    );
  });

  it("recovers malformed notification parameters without an action write", async () => {
    renderPayments({ targetMalformed: true });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The notification link is invalid",
    );
    expect(await screen.findByText("Rent")).toBeInTheDocument();
    expect(api.confirmRegularPayment).not.toHaveBeenCalled();
  });

  it("opens a valid notification target with its stable occurrence guard", async () => {
    api.confirmRegularPayment.mockResolvedValue({
      ...confirmation,
      futureAmountUpdateRequired: false,
    });
    renderPayments({
      target: {
        regularPaymentId: "rent",
        occurrenceAt: "2026-09-08T07:30:00.000Z",
        expectedVersion: 7,
      },
    });

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByDisplayValue("100")).toBeInTheDocument();
    expect(api.regularPayments).toHaveBeenCalledWith("bot", {
      status: "ACTIVE",
      id: "rent",
      limit: 1,
      cursor: undefined,
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Confirm payment" }),
    );
    await waitFor(() =>
      expect(api.confirmRegularPayment).toHaveBeenCalledWith("bot", "rent", {
        expectedOccurrenceAt: "2026-09-08T07:30:00.000Z",
        expectedVersion: 7,
        amount: "100",
      }),
    );
  });
});
