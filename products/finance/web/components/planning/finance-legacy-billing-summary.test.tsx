import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FinanceLegacyBillingSummary } from "./finance-legacy-billing-summary";

const api = vi.hoisted(() => ({ billing: vi.fn(), cancelAutoRenew: vi.fn(), resumeAutoRenew: vi.fn() }));
vi.mock("@consumer-finance/web/lib/api/consumer-finance-planning-api", () => ({ consumerFinancePlanningApi: api }));

const catalog = {
  current: { tier: "PRO", cancelAtPeriodEnd: false, activeUntil: "2026-11-28T00:00:00.000Z" },
  subscriptions: [{ id: "sub-1", source: "STRIPE", status: "ACTIVE", cancelAtPeriodEnd: false, currentPeriodEnd: "2026-11-28T00:00:00.000Z" }],
  paymentHistory: [{ id: "pay-1", status: "SUCCEEDED", amountMinor: 17900, currency: "UAH" }],
};
function view(locale: "uk" | "ru" | "en" = "en") {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <FinanceLegacyBillingSummary botId="bot-1" locale={locale} />
  </QueryClientProvider>);
}

describe("legacy Finance billing summary", () => {
  beforeEach(() => { vi.clearAllMocks(); api.billing.mockResolvedValue(catalog); });

  it("preserves paid access, payment history and renewal cancellation without old plan offers", async () => {
    api.cancelAutoRenew.mockResolvedValue({ id: "sub-1", cancelAtPeriodEnd: true, currentPeriodEnd: catalog.current.activeUntil });
    view();
    expect(await screen.findByText("PLUS")).toBeInTheDocument();
    expect(screen.getByText(/179\.00/)).toBeInTheDocument();
    expect(screen.queryByText("PRO")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Checkout|Choose plan|Payment details/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Cancel/ }));
    await waitFor(() => expect(api.cancelAutoRenew).toHaveBeenCalledOnce());
  });

  it("shows an error and retry when legacy status is unavailable", async () => {
    api.billing.mockRejectedValue(new Error("unavailable"));
    view("uk");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Повтор|Спроб/ })).toBeInTheDocument();
  });

  it("localizes legacy subscription status in Russian", async () => {
    view("ru");
    expect(await screen.findByText("Ваш доступ Finance")).toBeInTheDocument();
    expect(screen.getByText("История платежей")).toBeInTheDocument();
  });
});
