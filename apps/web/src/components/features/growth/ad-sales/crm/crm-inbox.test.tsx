import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  CrmConversationListItem,
  CrmInboxConversationItem,
} from "@telegram-system/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authApi, telegramUserAccountsApi } from "@/lib/api";
import { listCrmInboxConversations } from "@/lib/features/growth/crm-inbox-api";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import { leadPreparationApi } from "@/lib/features/growth/lead-preparation-api";
import { leadDiscoveryApi } from "@/lib/features/growth/lead-discovery-api";
import { CrmInbox } from "./crm-inbox";

const navigation = vi.hoisted(() => ({
  query: "",
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
  useSearchParams: () => new URLSearchParams(navigation.query),
}));
vi.mock("@/lib/api", () => ({
  authApi: {
    me: vi.fn().mockResolvedValue({
      workspace: {
        id: "workspace-one",
        access: { isOwner: true, permissionKeys: [] },
      },
    }),
  },
  telegramUserAccountsApi: { list: vi.fn() },
  telegramAdSalesApi: { listSalesPage: vi.fn() },
}));
vi.mock("@/lib/features/growth/crm-inbox-api", () => ({
  listCrmInboxConversations: vi.fn(),
}));
vi.mock("./crm-message-thread", () => ({
  CrmMessageThread: ({
    conversation,
    header,
  }: {
    conversation: { id: string };
    header: ReactNode;
  }) => (
    <div>
      {header}
      <p>Exact thread {conversation.id}</p>
    </div>
  ),
}));
vi.mock("@/components/chat/chat-details-panel", () => ({
  ChatDetailsPanel: ({
    children,
    title,
    onClose,
  }: {
    children: ReactNode;
    title: string;
    onClose: () => void;
  }) => (
    <aside aria-label={title}>
      <button onClick={onClose}>Close details</button>
      {children}
    </aside>
  ),
}));

const conversation = {
  id: "conversation-exact",
  workspaceId: "workspace-one",
  contactId: null,
  state: "ACTIVE",
  telegramCrmPeerId: "peer-one",
  mtprotoAccountId: "account-one",
  peer: {
    id: "peer-one",
    telegramUserId: "12345",
    username: "customer",
    firstName: "Customer",
    lastName: null,
    photoUrl: null,
  },
  account: { id: "account-one", label: "CRM", username: "crm", photoUrl: null },
} as CrmConversationListItem;
const listed = (id: string, title: string): CrmInboxConversationItem => ({
  id,
  workspaceId: "workspace-one",
  contact: {
    id: `client-${id}`,
    displayName: title,
    stage: "LEAD",
    nextContactAt: null,
  },
  peer: conversation.peer,
  account: conversation.account,
  state: "ACTIVE",
  lastMessageAt: "2026-10-30T12:00:00Z",
  lastInboundAt: null,
  lastOutboundAt: null,
  unreadCount: 0,
  readState: "READ",
  lastMessage: null,
});

function renderInbox(
  conversationId: string | null = "conversation-exact",
  peerId: string | null = "peer-one",
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const tree = (id: string | null, peer: string | null) => (
    <QueryClientProvider client={client}>
      <CrmInbox
        canManage
        canSendManual
        canViewSales
        conversationId={id}
        peerId={peer}
      />
    </QueryClientProvider>
  );
  const result = render(tree(conversationId, peerId));
  return {
    ...result,
    select: (id: string | null, peer: string | null = null) =>
      result.rerender(tree(id, peer)),
  };
}

describe("CrmInbox", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    navigation.query = "";
    vi.spyOn(telegramCrmApi, "listTags").mockResolvedValue([]);
    vi.spyOn(telegramCrmApi, "getConversation").mockResolvedValue(conversation);
    vi.spyOn(telegramCrmApi, "getContact").mockResolvedValue({
      id: "client-one",
      displayName: "Saved client",
      stage: "CUSTOMER",
      contactChannels: [],
      paymentSummary: [],
      counts: { deals: 0 },
    } as never);
    vi.mocked(telegramUserAccountsApi.list).mockResolvedValue([
      {
        id: "account-one",
        status: "connected",
        isActive: true,
        crmSendEnabled: true,
      },
    ] as never);
    vi.mocked(listCrmInboxConversations).mockResolvedValue({
      items: [],
      nextCursor: null,
      hasMore: false,
    });
  });

  it("filters the Inbox by a synced Telegram folder", async () => {
    vi.mocked(telegramCrmApi.listTags).mockResolvedValue([{ id: "folder-a", name: "VIP", color: "#ff0088", systemKey: "TELEGRAM_FOLDER:account-one:9", isSystem: true, assignmentMode: "AUTOMATIC" }]);
    renderInbox(null, null);
    await waitFor(() => expect(telegramCrmApi.listTags).toHaveBeenCalled());
    await userEvent.click(screen.getByRole("button", { name: "Telegram folders" }));
    const option = await screen.findByRole("button", { name: "VIP" });
    expect(option.querySelector("span[style]")).toHaveStyle({ color: "#ff0088" });
    await userEvent.click(option);
    await waitFor(() => expect(listCrmInboxConversations).toHaveBeenCalledWith(expect.objectContaining({ folderId: "folder-a" }), null, expect.any(AbortSignal)));
    expect(screen.getByText("Shows linked clients with synced Telegram folders.")).toBeInTheDocument();
  });

  it("loads an exact authorized deep link even when the mounted first list page is empty", async () => {
    renderInbox();
    expect(
      await screen.findByText("Exact thread conversation-exact"),
    ).toBeInTheDocument();
    expect(telegramCrmApi.getConversation).toHaveBeenCalledWith(
      "conversation-exact",
      expect.any(AbortSignal),
    );
    expect(listCrmInboxConversations).toHaveBeenCalledWith(
      { filter: "ALL", search: undefined, limit: 50 },
      null,
      expect.any(AbortSignal),
    );
    expect(
      screen.getByRole("searchbox", { name: "Search conversations" }),
    ).toBeInTheDocument();
  });

  it.each(["ACTIVE", "ARCHIVED"] as const)(
    "allows authorized linked conversations in %s state",
    async (state) => {
      vi.mocked(telegramCrmApi.getConversation).mockResolvedValue({
        ...conversation,
        contactId: "client-one",
        state,
      });
      renderInbox();
      expect(
        await screen.findByText("Exact thread conversation-exact"),
      ).toBeInTheDocument();
      expect(telegramCrmApi.getContact).not.toHaveBeenCalled();
    },
  );

  it("rejects a stale peer link without rendering the thread", async () => {
    renderInbox("conversation-exact", "another-peer");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "no longer matches the selected Telegram contact",
    );
    expect(screen.queryByText(/Exact thread/u)).not.toBeInTheDocument();
  });

  it("pushes first selection, replaces later selections and returns to the list with browser back", async () => {
    vi.mocked(listCrmInboxConversations).mockResolvedValue({
      items: [listed("chat-a", "Alice"), listed("chat-b", "Bob")],
      nextCursor: null,
      hasMore: false,
    });
    vi.mocked(telegramCrmApi.getConversation).mockImplementation(
      async (id) => ({ ...conversation, id }),
    );
    const view = renderInbox(null, null);
    await userEvent.click(await screen.findByRole("option", { name: /Alice/ }));
    expect(navigation.push).toHaveBeenCalledWith(
      "/ad-sales/inbox?conversationId=chat-a",
      { scroll: false },
    );
    view.select("chat-a");
    await screen.findByText("Exact thread chat-a");
    await userEvent.click(screen.getByRole("option", { name: /Bob/ }));
    expect(navigation.replace).toHaveBeenCalledWith(
      "/ad-sales/inbox?conversationId=chat-b",
      { scroll: false },
    );
    view.select("chat-b");
    await screen.findByText("Exact thread chat-b");
    await userEvent.click(
      screen.getByRole("button", { name: "Back to inbox" }),
    );
    expect(navigation.back).toHaveBeenCalledOnce();
    view.select(null);
    expect(
      screen.getByText("Your conversations, in one place"),
    ).toBeInTheDocument();
  });

  it("returns deep links to the list directly instead of leaving the CRM", async () => {
    renderInbox();
    await screen.findByText("Exact thread conversation-exact");
    await userEvent.click(
      screen.getByRole("button", { name: "Back to inbox" }),
    );
    expect(navigation.replace).toHaveBeenCalledWith("/ad-sales/inbox", {
      scroll: false,
    });
    expect(navigation.back).not.toHaveBeenCalled();
  });

  it("shows review candidates without requesting or fabricating conversations", async () => {
    vi.mocked(authApi.me).mockResolvedValue({
      workspace: {
        id: "workspace-one",
        access: { isOwner: true, permissionKeys: [] },
      },
    } as never);
    vi.spyOn(leadDiscoveryApi, "config").mockResolvedValue({
      enabled: false,
      canManage: false,
      canReview: false,
      canAnalyze: false,
      maxSources: 100,
      maxPostsPerDay: 1000,
      maxSourceImport: 100,
      maxMaterialBatch: 20,
    });
    vi.spyOn(leadPreparationApi, "queue").mockResolvedValue({
      items: [],
      hasMore: false,
      nextCursor: null,
    });
    renderInbox(null, null);
    await userEvent.click(screen.getByRole("button", { name: "AI Leads" }));
    expect(
      await screen.findByText(
        "Review evidence, qualify explicitly, then prepare a first offer. No automatic generation, rejection or outreach.",
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(leadPreparationApi.queue).toHaveBeenCalled());
    expect(
      vi
        .mocked(listCrmInboxConversations)
        .mock.calls.some((call) => call[0].filter === "AI_LEADS"),
    ).toBe(false);
  });

  it("offers recovery for a failed list request", async () => {
    vi.mocked(listCrmInboxConversations).mockRejectedValueOnce(
      new Error("Network unavailable"),
    );
    const view = renderInbox(null, null);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Conversations could not be loaded",
    );
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByText("No conversations match this view."),
    ).toBeInTheDocument();
    expect(listCrmInboxConversations).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it("loads real client data only after details opens and closes through browser back", async () => {
    vi.mocked(telegramCrmApi.getConversation).mockResolvedValue({
      ...conversation,
      contactId: "client-one",
    });
    const view = renderInbox();
    await screen.findByText("Exact thread conversation-exact");
    expect(telegramCrmApi.getContact).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Client details" }),
    );
    expect(navigation.push).toHaveBeenCalledWith(
      "/ad-sales/inbox?conversationId=conversation-exact&details=1",
      { scroll: false },
    );
    navigation.query = "details=1";
    view.select("conversation-exact", "peer-one");
    expect(await screen.findByText("Saved client")).toBeInTheDocument();
    expect(telegramCrmApi.getContact).toHaveBeenCalledWith(
      "client-one",
      expect.any(AbortSignal),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Close details" }),
    );
    expect(navigation.back).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(telegramCrmApi.getConversation).toHaveBeenCalledTimes(1),
    );
  });
});
