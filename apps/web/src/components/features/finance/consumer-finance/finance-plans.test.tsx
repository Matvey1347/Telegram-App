import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsumerBillingCatalog } from "@telegram-system/shared";
import { FinancePlans } from "./finance-plans";

const api = vi.hoisted(() => ({
  billing: vi.fn(),
  checkout: vi.fn(),
  cancelAutoRenew: vi.fn(),
  resumeAutoRenew: vi.fn(),
  paymentPortal: vi.fn(),
}));
vi.mock("@/lib/features/finance/consumer-finance-planning-api", () => ({
  consumerFinancePlanningApi: api,
}));

const catalog: ConsumerBillingCatalog = {
  current: {
    tier: "FREE",
    capabilities: [],
    usage: [
      {
        feature: "AI_INPUT",
        used: 7,
        limit: 10,
        remaining: 3,
        resetAt: null,
      },
    ],
    activeUntil: null,
    cancelAtPeriodEnd: false,
  },
  plans: [
    {
      id: null,
      code: "FREE",
      capabilities: [],
      features: [
        "ACCOUNTS",
        "TRANSACTIONS",
        "DEBTS",
        "REGULAR_PAYMENTS",
        "DETAILED_ANALYTICS",
        "PERIOD_COMPARISON",
        "DETERMINISTIC_TRENDS",
      ],
      usageLimits: { AI_INPUT: 10, RECEIPT_SCAN: 3, AI_INSIGHTS: 0 },
      canPurchase: false,
      prices: [],
    },
    {
      id: "pro",
      code: "PRO",
      capabilities: ["AI_INPUT", "RECEIPT_SCAN"],
      features: ["AI_INPUT", "RECEIPT_SCAN", "SMART_LIMITS"],
      usageLimits: { AI_INPUT: null, RECEIPT_SCAN: 30, AI_INSIGHTS: 0 },
      canPurchase: true,
      prices: [
        {
          id: "pro-month",
          currency: "UAH",
          interval: "MONTH",
          amountMinor: 14900,
          version: 1,
        },
        {
          id: "pro-stars",
          currency: "XTR",
          interval: "MONTH",
          amountMinor: 250,
          version: 1,
        },
      ],
    },
    {
      id: "ultimate",
      code: "ULTIMATE",
      capabilities: ["FINANCE_HISTORY_QA", "AI_INSIGHTS"],
      features: ["FINANCE_HISTORY_QA", "AI_INSIGHTS"],
      usageLimits: { AI_INPUT: null, RECEIPT_SCAN: 200, AI_INSIGHTS: 100 },
      canPurchase: true,
      prices: [
        {
          id: "ultimate-month",
          currency: "UAH",
          interval: "MONTH",
          amountMinor: 24900,
          version: 1,
        },
      ],
    },
  ],
  subscriptions: [],
  paymentHistory: [],
  providers: [
    {
      provider: "STRIPE",
      mode: "TEST",
      capabilities: { intervals: ["MONTH", "YEAR"] },
    },
    {
      provider: "TELEGRAM_STARS",
      mode: "LIVE",
      capabilities: { intervals: ["MONTH"] },
    },
  ],
};

function renderPlans() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <FinancePlans botId="bot" locale="en" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.billing.mockResolvedValue(catalog);
});

describe("FinancePlans", () => {
  it("uses the branded wallet loading scene instead of skeleton blocks", () => {
    api.billing.mockReturnValue(new Promise(() => undefined));
    renderPlans();

    const loading = screen.getByRole("status");
    expect(loading).toHaveAttribute("data-finance-feedback", "loading");
    expect(loading).toHaveTextContent("Loading plan…");
    expect(
      loading.querySelector("[data-finance-context='plan'] img"),
    ).toBeInTheDocument();
    expect(document.querySelector(".animate-pulse")).toBeNull();
  });

  it("shows a dedicated empty catalog state", async () => {
    api.billing.mockResolvedValue({ ...catalog, plans: [] });
    renderPlans();

    expect(
      await screen.findByText("No plans are available for this bot yet."),
    ).toBeInTheDocument();
    expect(document.querySelector("[data-finance-plan]")).toBeNull();
  });

  it("loads one canonical read model and shows Free analytics plus paid AI limits", async () => {
    renderPlans();

    expect(await screen.findAllByText("Finance Free")).toHaveLength(1);
    expect(
      screen.getByText("Your finances, with more room to grow"),
    ).toBeVisible();
    expect(
      document.querySelector("img[src*='plans-hero']"),
    ).toBeInTheDocument();
    expect(screen.getByText("Current plan")).toBeInTheDocument();
    expect(screen.queryByText("Usage")).not.toBeInTheDocument();
    expect(screen.getByText("Most popular")).toBeInTheDocument();
    expect(
      document.querySelector("[data-finance-plan='PRO'][data-featured='true']"),
    ).toBeInTheDocument();
    expect(
      document.querySelectorAll("[data-finance-plan-visual]"),
    ).toHaveLength(3);
    expect(api.billing).toHaveBeenCalledOnce();
    expect(
      screen.getByText("Detailed financial analytics"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Period-over-period comparison"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("AI explanations of financial signals: 100"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" &&
          element.textContent === "UAH 149.00 / month",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" && element.textContent === "250 XTR / month",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("7/10")).not.toBeInTheDocument();
  });

  it("shows the account payment history", async () => {
    api.billing.mockResolvedValue({
      ...catalog,
      paymentHistory: [
        {
          id: "payment-1",
          status: "SUCCEEDED",
          provider: "STRIPE",
          amountMinor: 14900,
          currency: "UAH",
          occurredAt: "2026-09-09T09:30:00.000Z",
          planCode: "PRO",
        },
      ],
    });

    renderPlans();

    expect(await screen.findByText("Payment history")).toBeInTheDocument();
    const paymentRow = screen.getByText("Paid").parentElement?.parentElement;
    expect(paymentRow?.textContent).toContain("149.00");
    expect(paymentRow).toHaveTextContent("Stripe");
  });

  it("shows one clean plan CTA, then opens the selected payment method", async () => {
    api.checkout.mockReturnValue(new Promise(() => undefined));
    renderPlans();

    await screen.findAllByRole("button", { name: "Choose" });
    const pro = document.querySelector("[data-finance-plan='PRO']");
    expect(pro).not.toBeNull();
    const choose = within(pro as HTMLElement).getByRole("button", {
      name: "Choose",
    });
    const firstFeature = within(pro as HTMLElement).getByRole(
      "list",
    ).firstChild;
    expect(
      choose.compareDocumentPosition(firstFeature as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(choose).toHaveClass("w-full", "bg-blue-600");
    expect(
      within(pro as HTMLElement).queryByRole("button", { name: /Stripe/i }),
    ).not.toBeInTheDocument();
    expect(
      within(pro as HTMLElement).queryByText(/Test|Live/),
    ).not.toBeInTheDocument();

    fireEvent.click(choose);
    expect(api.checkout).not.toHaveBeenCalled();
    const methods = within(pro as HTMLElement).getByRole("group", {
      name: "Choose a payment method",
    });
    expect(within(methods).getByText("Bank card")).toBeInTheDocument();
    fireEvent.click(
      within(methods).getByRole("button", { name: /Telegram Stars/ }),
    );

    await waitFor(() =>
      expect(api.checkout).toHaveBeenCalledWith(
        "bot",
        "TELEGRAM_STARS",
        "pro-stars",
        "LIVE",
      ),
    );
  });

  it("starts checkout immediately when the plan has one payment method", async () => {
    api.checkout.mockReturnValue(new Promise(() => undefined));
    renderPlans();

    await screen.findAllByRole("button", { name: "Choose" });
    const ultimate = document.querySelector("[data-finance-plan='ULTIMATE']");
    expect(ultimate).not.toBeNull();
    fireEvent.click(
      within(ultimate as HTMLElement).getByRole("button", { name: "Choose" }),
    );

    await waitFor(() =>
      expect(api.checkout).toHaveBeenCalledWith(
        "bot",
        "STRIPE",
        "ultimate-month",
        "TEST",
      ),
    );
    expect(
      within(ultimate as HTMLElement).queryByRole("group", {
        name: "Choose a payment method",
      }),
    ).not.toBeInTheDocument();
  });

  it("keeps payment choices available after checkout fails", async () => {
    api.checkout.mockRejectedValue(new Error("offline"));
    renderPlans();

    await screen.findAllByRole("button", { name: "Choose" });
    const pro = document.querySelector("[data-finance-plan='PRO']");
    expect(pro).not.toBeNull();
    fireEvent.click(
      within(pro as HTMLElement).getByRole("button", { name: "Choose" }),
    );
    const methods = within(pro as HTMLElement).getByRole("group", {
      name: "Choose a payment method",
    });
    fireEvent.click(within(methods).getByRole("button", { name: /Bank card/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not open checkout. Try again.",
    );
    expect(
      within(pro as HTMLElement).getByRole("group", {
        name: "Choose a payment method",
      }),
    ).toBeInTheDocument();
  });

  it("retries the single catalog request after an error", async () => {
    api.billing.mockRejectedValueOnce(new Error("offline"));
    renderPlans();

    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await waitFor(() => expect(api.billing).toHaveBeenCalledTimes(2));
  });

  it("does not offer a backend-forbidden same-tier purchase or downgrade", async () => {
    api.billing.mockResolvedValue({
      ...catalog,
      current: { ...catalog.current, tier: "ULTIMATE" },
      plans: catalog.plans.map((plan) => ({ ...plan, canPurchase: false })),
    });

    renderPlans();

    await screen.findAllByText("Finance Ultimate");
    expect(screen.queryByRole("button", { name: /Choose/ })).toBeNull();
    const currentPlan = document.querySelector(
      "[data-finance-plan='ULTIMATE']",
    );
    expect(currentPlan).not.toBeNull();
    expect(
      within(currentPlan as HTMLElement).getByText("Current plan"),
    ).toBeInTheDocument();
    expect(
      within(currentPlan as HTMLElement).queryByText("Unavailable"),
    ).not.toBeInTheDocument();
    expect(api.checkout).not.toHaveBeenCalled();
  });
});
