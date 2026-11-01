import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CrmPackageSalesContext as PackageContext, CrmPurchaseItem, CrmPurchasesPage } from "@telegram-system/shared";
import { crmSalesWorkflowApi } from "@/lib/features/growth/crm-sales-workflow-api";
import { CrmInboxPurchases } from "./crm-inbox-purchases";
import { CrmPackageSalesContext } from "./crm-package-sales-context";

vi.mock("@/lib/features/growth/crm-sales-workflow-api", () => ({ crmSalesWorkflowApi: { purchases: vi.fn(), packages: vi.fn() } }));
const sale: CrmPurchaseItem = { id: "sale-a", title: "Seven-channel package", status: "COMPLETED", dealStage: "COMPLETED", createdAt: "2026-10-20T10:00:00Z", settlementCurrency: "USD",
  agreedByCurrency: [{ currency: "UAH", amount: "2800" }, { currency: "USD", amount: "50" }], receivedByCurrency: [{ currency: "USD", amount: "50" }],
  placements: [
    { id: "placement-a", channel: { id: "channel-a", title: "Psychology" }, productName: "24h post", networkName: "Own channels", agreedPrice: "2800", currency: "UAH", status: "COMPLETED", scheduledAt: "2026-10-20T10:00:00Z" },
    { id: "placement-b", channel: { id: "channel-b", title: "Learning" }, productName: null, networkName: null, agreedPrice: "50", currency: "USD", status: "COMPLETED", scheduledAt: "2026-10-20T10:00:00Z" },
  ], hasMorePlacements: false, historicalDataIncomplete: true };
const first: CrmPurchasesPage = { summary: { dealCount: 1000, purchaseCount: 900, receivedByCurrency: [{ currency: "USD", amount: "45000" }], agreedByCurrency: [{ currency: "UAH", amount: "2800000" }], lastPurchaseAt: sale.createdAt, attribution: "LINKED_SALES_ONLY" }, items: [sale], nextCursor: "older-sales", hasMore: true };
function mount(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(crmSalesWorkflowApi.purchases).mockResolvedValue(first); });

describe("lazy sales context", () => {
  it("does not repeat the purchase amount in a summary for one linked sale", async () => {
    vi.mocked(crmSalesWorkflowApi.purchases).mockResolvedValue({ ...first, summary: { ...first.summary!, dealCount: 1 }, nextCursor: null, hasMore: false });
    mount(<CrmInboxPurchases contactId="client-a" conversationId="thread-a" workspaceId="workspace-b" />);
    await screen.findByRole("link", { name: /Seven-channel package/ });
    expect(screen.getAllByText("50 USD")).toHaveLength(1);
    expect(screen.queryByText("45,000 USD")).not.toBeInTheDocument();
    expect(screen.queryByText("1 ·")).not.toBeInTheDocument();
  });
  it("renders a compact summary and linked deals and loads only the next cursor", async () => {
    vi.mocked(crmSalesWorkflowApi.purchases).mockResolvedValueOnce(first).mockResolvedValueOnce({ summary: null, items: [{ ...sale, id: "sale-older", title: "Older sale" }], nextCursor: null, hasMore: false });
    mount(<CrmInboxPurchases contactId="client-a" conversationId="thread-a" workspaceId="workspace-b" />);
    expect(await screen.findByText("1000 ·")).toBeInTheDocument();
    expect(screen.getByText("45,000 USD")).toBeInTheDocument();
    expect(screen.getByText("Psychology · Learning")).toBeInTheDocument();
    const target = new URL(screen.getByRole("link", { name: /Seven-channel package/ }).getAttribute("href")!, "https://internal.test");
    expect(target.searchParams.get("saleId")).toBe(sale.id);
    expect(target.searchParams.get("returnTo")).toBe("/ad-sales/inbox?conversationId=thread-a&workspaceId=workspace-b&details=1");
    expect(crmSalesWorkflowApi.purchases).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Older sale")).toBeInTheDocument();
    expect(crmSalesWorkflowApi.purchases).toHaveBeenLastCalledWith("client-a", "older-sales", expect.any(AbortSignal));
    expect(crmSalesWorkflowApi.packages).not.toHaveBeenCalled();
  });
  it("shows unavailable prices as manager quotes and current network composition without fabricating a package total", async () => {
    vi.mocked(crmSalesWorkflowApi.packages).mockResolvedValue({ asOf: "2026-10-31T10:00:00Z", discountPolicy: "MANAGER_APPROVAL_REQUIRED", networks: [{ id: "network-a", name: "Own seven channels", channels: Array.from({ length: 7 }, (_, index) => ({ id: `channel-${index}`, title: `Channel ${index + 1}` })), channelsTruncated: false, updatedAt: "2026-10-30T10:00:00Z" }], networksTruncated: false,
      products: [{ id: "product-a", name: "CPM placement", channel: { id: "channel-1", title: "Channel 1" }, pricingMode: "CPM", fixedPrice: null, cpm: "10", minimumPrice: null, currency: "USD", quoteRequired: true, topDurationMinutes: null, feedDurationHours: 24, deleteAfterHours: 24, isPermanent: false, updatedAt: "2026-10-30T10:00:00Z", constraints: null }], nextCursor: null, hasMore: false } satisfies PackageContext);
    mount(<CrmPackageSalesContext />);
    expect(await screen.findByText("Own seven channels")).toBeInTheDocument();
    expect(screen.getByText(/Channel 1 · Channel 2 · Channel 3/)).toBeInTheDocument();
    expect(screen.getByText("Manager quote required")).toBeInTheDocument();
    expect(screen.getByText("Fixed price: Not recorded")).toBeInTheDocument();
    expect(screen.getByText("CPM: 10 USD")).toBeInTheDocument();
    expect(screen.queryByText("0 USD", { exact: true })).not.toBeInTheDocument();
    expect(crmSalesWorkflowApi.purchases).not.toHaveBeenCalled();
  });
  it("offers retry for unavailable package context", async () => {
    vi.mocked(crmSalesWorkflowApi.packages).mockRejectedValueOnce(new Error("Unavailable")).mockResolvedValue({ asOf: "2026-10-31T10:00:00Z", networks: [], networksTruncated: false, products: [], nextCursor: null, hasMore: false, discountPolicy: "MANAGER_APPROVAL_REQUIRED" });
    mount(<CrmPackageSalesContext />);
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be loaded");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No active products recorded.")).toBeInTheDocument();
  });
});
