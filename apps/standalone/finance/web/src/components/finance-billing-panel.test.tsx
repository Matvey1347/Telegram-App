import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FinanceBillingPanel } from "./finance-billing-panel";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  checkout: vi.fn(),
  portal: vi.fn(),
  cancel: vi.fn(),
  resume: vi.fn(),
}));
vi.mock("@finance-web/lib/billing/finance-billing-api", () => ({
  financeBillingApi: api,
}));

const catalog = {
  tier: "FREE" as const,
  activeUntil: null,
  cancelAtPeriodEnd: false,
  subscription: null,
  history: [],
  offers: [
    {
      code: "INTRO",
      amountMinor: 700,
      currency: "UAH",
      intervalLabel: "7 days",
      introNextAmountMinor: 17900,
      available: true,
    },
    {
      code: "MONTH",
      id: "price-month",
      mode: "TEST",
      amountMinor: 17900,
      currency: "UAH",
      intervalLabel: "Monthly",
      available: true,
    },
    {
      code: "QUARTER",
      amountMinor: 39900,
      currency: "UAH",
      intervalLabel: "Every 3 months",
      available: true,
    },
    {
      code: "YEAR",
      amountMinor: 109900,
      currency: "UAH",
      intervalLabel: "Yearly",
      available: true,
    },
  ],
};

function view(telegramInitData?: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <FinanceBillingPanel
        botId="bot-1"
        telegramInitData={telegramInitData}
        identityScope="user-1"
        t={(_uk, en) => en}
        language="en"
      />
    </QueryClientProvider>,
  );
}

describe("FinanceBillingPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue(catalog);
  });

  it("shows four offers and discloses the introductory renewal before Checkout", async () => {
    view();
    expect(
      await screen.findByRole("radiogroup", { name: "PLUS billing option" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    fireEvent.click(screen.getByRole("radio", { name: /7 days/ }));
    expect(
      screen.getByText(/Pay UAH\s*7\.00 for 7 days now/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/renews automatically at UAH\s*179\.00 per month/),
    ).toBeInTheDocument();
    expect(screen.getByText("No payments yet.")).toBeInTheDocument();
  });

  it("does not offer an introductory period after it has been used", async () => {
    api.get.mockResolvedValue({
      ...catalog,
      offers: catalog.offers.map((offer) =>
        offer.code === "INTRO" ? { ...offer, available: false } : offer,
      ),
    });
    view();
    expect(await screen.findByRole("radio", { name: /7 days/ })).toBeDisabled();
    expect(screen.queryByText(/for 7 days now/)).not.toBeInTheDocument();
  });

  it("renders confirmed payment history and cancellation management", async () => {
    api.get.mockResolvedValue({
      ...catalog,
      tier: "PLUS",
      subscription: {
        id: "sub-1",
        status: "ACTIVE",
        source: "STRIPE",
        offerCode: "MONTH",
        currentPeriodEnd: "2026-11-28T00:00:00Z",
        cancelAtPeriodEnd: false,
      },
      history: [
        {
          id: "payment-1",
          status: "SUCCEEDED",
          amountMinor: 17900,
          currency: "UAH",
          cashAmountMinor: 17900,
          bonusAmountMinor: 0,
          occurredAt: "2026-10-28T00:00:00Z",
        },
      ],
    });
    api.cancel.mockResolvedValue({ ...catalog, cancelAtPeriodEnd: true });
    view();
    expect(await screen.findByText("Paid")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel renewal" }));
    await waitFor(() => expect(api.cancel).toHaveBeenCalledWith("bot-1"));
  });

  it("shows a retry state when Finance billing is unavailable", async () => {
    api.get.mockRejectedValue(new Error("unauthorized"));
    view();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to load billing",
    );
    expect(
      screen.queryByRole("button", { name: "Get PLUS" }),
    ).not.toBeInTheDocument();
  });

  it("emits a Checkout start event only for the external website action", async () => {
    api.checkout.mockRejectedValue(new Error("Checkout unavailable"));
    const started = vi.fn();
    window.addEventListener("finance:checkout_start", started);
    view();
    fireEvent.click(await screen.findByRole("button", { name: "Get PLUS" }));
    await waitFor(() =>
      expect(api.checkout).toHaveBeenCalledWith("bot-1", "price-month", "TEST"),
    );
    expect(started).toHaveBeenCalledOnce();
    window.removeEventListener("finance:checkout_start", started);
  });

  it("uses an existing Finance cookie even after Mini App initData ages out", async () => {
    view("old-signed-init-data");
    expect(await screen.findByText("No payments yet.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Get PLUS" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/cannot be purchased in the Telegram Mini App/),
    ).toBeInTheDocument();
  });
});
