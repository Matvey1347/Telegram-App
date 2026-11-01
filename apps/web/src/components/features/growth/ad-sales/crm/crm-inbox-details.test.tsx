import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CrmContactDetail, CrmConversationListItem } from "@telegram-system/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { crmSalesWorkflowApi } from "@/lib/features/growth/crm-sales-workflow-api";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import { CrmInboxDetails } from "./crm-inbox-details";

vi.mock("@/lib/features/growth/crm-sales-workflow-api", () => ({ crmSalesWorkflowApi: { purchases: vi.fn(), packages: vi.fn() } }));
vi.mock("./crm-sales-controls", () => ({ CrmSalesControls: () => <p>Workflow controls</p> }));
vi.mock("./crm-contact-notes", () => ({
  CrmContactNotes: vi.fn(({ canEdit }: { canEdit: boolean }) => <button disabled={!canEdit}>Add test note</button>),
}));


const contact: CrmContactDetail = {
  id: "client-a", workspaceId: "workspace-a", displayName: "Saved CRM customer",
  companyName: null, telegramUsername: "saved_customer", phone: null, email: null,
  website: null, description: "Saved client description", source: "Manual contact",
  stage: "CUSTOMER", ownerMemberId: "owner-a", avatarPresentation: null,
  lastContactAt: null, lastInboundAt: null, lastOutboundAt: null, lastPurchaseAt: null,
  nextContactAt: null, archivedAt: null, activeDealCount: 0,
  createdAt: "2026-10-30T10:00:00Z", updatedAt: "2026-10-30T10:00:00Z",
  ownerMember: null, peers: [], conversationAccounts: [], unreadCount: 0, tags: [],
  contactChannels: [], paymentSummary: [{ currency: "UAH", paidAmount: "2500", agreedAmount: "2500", outstandingAmount: "0" }],
  counts: { conversations: 1, deals: 2, openTasks: 0, activities: 0 },
};
const conversation = {
  id: "conversation-a", workspaceId: "workspace-a", contactId: contact.id,
  telegramCrmPeerId: "peer-a", peer: { username: "saved_customer" },
} as CrmConversationListItem;

function renderDetails({ canManage = false, canEditOwn = false, currentMemberId = "owner-a", canViewSales = false } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><CrmInboxDetails conversation={conversation} canManage={canManage} canEditOwn={canEditOwn} currentMemberId={currentMemberId} canViewSales={canViewSales} /></QueryClientProvider>);
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.spyOn(telegramCrmApi, "getContact").mockResolvedValue(contact);
  vi.spyOn(telegramCrmApi, "getChatContext").mockResolvedValue(contact);
  vi.mocked(crmSalesWorkflowApi.purchases).mockResolvedValue({ items: [], summary: null, nextCursor: null, hasMore: false } as never);
});

describe("CRM inbox details permissions", () => {
  it("renders contact link, notes and independent purchases before compact identity resolves", async () => {
    vi.mocked(telegramCrmApi.getChatContext).mockImplementation(() => new Promise(() => undefined));
    renderDetails({ canManage: true, canViewSales: true });
    expect(screen.getByRole("link", { name: "@saved_customer" })).toHaveAttribute("href", "https://t.me/saved_customer");
    expect(screen.getByRole("button", { name: "Add test note" })).not.toBeDisabled();
    expect(screen.getByText("Workflow controls")).toBeInTheDocument();
    expect(await screen.findByText("No linked sales recorded.")).toBeInTheDocument();
    expect(crmSalesWorkflowApi.purchases).toHaveBeenCalledTimes(1);
    expect(telegramCrmApi.getContact).not.toHaveBeenCalled();
    expect(screen.queryByText(/Open client profile/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Packages|Пакеты/ })).not.toBeInTheDocument();
  });
  it.each([
    { label: "own-edit permission and matching owner", canManage: false, canEditOwn: true, currentMemberId: "owner-a", editable: true },
    { label: "own-edit permission and foreign owner", canManage: false, canEditOwn: true, currentMemberId: "another-member", editable: false },
    { label: "read-only access to an owned client", canManage: false, canEditOwn: false, currentMemberId: "owner-a", editable: false },
    { label: "own-edit permission before member identity resolves", canManage: false, canEditOwn: true, currentMemberId: "", editable: false },
    { label: "manage-all permission and foreign owner", canManage: true, canEditOwn: false, currentMemberId: "another-member", editable: true },
  ])("passes correct note permissions for $label", async ({ editable, ...permissions }) => {
    renderDetails(permissions);
    await screen.findByText(contact.displayName);

    const noteButton = screen.getByRole("button", { name: "Add test note" });
    if (editable) expect(noteButton).not.toBeDisabled();
    else expect(noteButton).toBeDisabled();
    expect(telegramCrmApi.getChatContext).toHaveBeenCalledWith(contact.id, expect.any(AbortSignal));
    expect(telegramCrmApi.getContact).not.toHaveBeenCalled();
  });

  it("hides sales summaries and never queries purchases without sales permission", async () => {
    renderDetails({ canManage: true, canViewSales: false });
    await screen.findByText(contact.displayName);
    expect(screen.queryByRole("heading", { name: "Purchases" })).not.toBeInTheDocument();
    expect(screen.queryByText("Paid: 2500 UAH")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Purchase history & packages" })).not.toBeInTheDocument();
    expect(crmSalesWorkflowApi.purchases).not.toHaveBeenCalled();
  });

  it("shows purchases immediately and offers recovery for failure", async () => {
    vi.mocked(crmSalesWorkflowApi.purchases).mockRejectedValueOnce(new Error("Sales temporarily unavailable"));
    renderDetails({ canViewSales: true });
    await screen.findByText(contact.displayName);
    expect(screen.queryByText("Paid: 2500 UAH")).not.toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("Purchase history could not be loaded");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No linked sales recorded.")).toBeInTheDocument();
    expect(crmSalesWorkflowApi.purchases).toHaveBeenCalledWith(contact.id, null, expect.any(AbortSignal));
    expect(screen.getByRole("button", { name: "Add test note" })).toBeInTheDocument();
  });
});
