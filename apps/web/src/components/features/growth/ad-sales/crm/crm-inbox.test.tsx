import type { ReactNode } from "react";
import { keepPreviousData, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  CrmConversationListItem,
  CrmInboxConversationItem,
  CrmInboxConversationsPage,
} from "@telegram-system/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authApi, telegramUserAccountsApi } from "@/lib/api";
import { listCrmInboxConversations, listCrmInboxFolders } from "@/lib/features/growth/crm-inbox-api";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
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
  usePathname: () => "/ad-sales/inbox",
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
  listCrmInboxFolders: vi.fn(),
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
  ignoreInUnread: false,
  readState: "READ",
  lastMessage: null,
});

function renderInbox(
  conversationId: string | null = "conversation-exact",
  peerId: string | null = "peer-one",
  keepPrevious = false,
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, ...(keepPrevious ? { placeholderData: keepPreviousData } : {}) }, mutations: { retry: false } },
  }),
) {
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
    vi.spyOn(telegramCrmApi, "listMessages").mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
    vi.mocked(listCrmInboxFolders).mockResolvedValue({ items: [], totalUnread: 0 });
    vi.spyOn(telegramCrmApi, "getConversation").mockResolvedValue(conversation);
    vi.spyOn(telegramCrmApi, "getContact").mockResolvedValue({
      id: "client-one",
      displayName: "Saved client",
      stage: "CUSTOMER",
      contactChannels: [],
      tags: [],
      paymentSummary: [],
      counts: { deals: 0 },
    } as never);
    vi.spyOn(telegramCrmApi, "getChatContext").mockResolvedValue({ id: "client-one", displayName: "Saved client" } as never);
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

  it("starts loading messages while the conversation detail is pending", async () => {
    vi.mocked(telegramCrmApi.getConversation).mockReturnValue(new Promise(() => {}));
    renderInbox();
    await waitFor(() => expect(telegramCrmApi.listMessages).toHaveBeenCalledWith("conversation-exact", null, 50, expect.any(AbortSignal)));
    expect(screen.getByText("Loading messages…")).toBeInTheDocument();
  });

  it("shows server-wide folder counts and switches between a folder and all unread conversations", async () => {
    vi.mocked(listCrmInboxFolders).mockResolvedValue({ items: [
      { id: "folder-a", name: "VIP", color: "#ff0088", emojiPresentation: null, unreadCount: 7, excludeRead: false },
      { id: "folder-b", name: "Partners", color: null, emojiPresentation: null, unreadCount: 2, excludeRead: false },
    ], totalUnread: 17 });
    renderInbox(null, null);
    const option = await screen.findByRole("button", { name: "VIP, 7 unread messages" });
    expect(screen.getByRole("button", { name: "Partners, 2 unread messages" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All chats, 17 unread messages" })).toBeInTheDocument();
    await userEvent.click(option);
    await waitFor(() => expect(listCrmInboxConversations).toHaveBeenCalledWith(expect.objectContaining({ folderId: "folder-a" }), null, expect.any(AbortSignal)));
    expect(option).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByText("VIP")).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: "Unread · 17" }));
    await waitFor(() => expect(listCrmInboxConversations).toHaveBeenLastCalledWith({ filter: "UNREAD", search: undefined, limit: 50 }, null, expect.any(AbortSignal)));
    expect(option).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(option);
    expect(option).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "All chats, 17 unread messages" }));
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(listCrmInboxConversations).toHaveBeenCalledWith({ filter: "ALL", search: undefined, limit: 50 }, null, expect.any(AbortSignal));
  });

  it("reports folder loading errors and retries without inventing unread counts", async () => {
    vi.mocked(listCrmInboxFolders).mockRejectedValueOnce(new Error("unavailable"));
    renderInbox(null, null);
    await userEvent.click(await screen.findByRole("button", { name: "Folders unavailable. Retry" }));
    await waitFor(() => expect(listCrmInboxFolders).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("button", { name: "All chats, 0 unread messages" })).toBeInTheDocument();
  });

  it("does not show the previous list while a different folder or Unread view loads", async () => {
    vi.mocked(listCrmInboxFolders).mockResolvedValue({ items: [{ id: "folder-a", name: "VIP", color: null, emojiPresentation: null, unreadCount: 2, excludeRead: false }], totalUnread: 2 });
    let resolveFolder!: (page: CrmInboxConversationsPage) => void;
    let resolveUnread!: (page: CrmInboxConversationsPage) => void;
    const folderPage = new Promise<CrmInboxConversationsPage>((resolve) => { resolveFolder = resolve; });
    const unreadPage = new Promise<CrmInboxConversationsPage>((resolve) => { resolveUnread = resolve; });
    vi.mocked(listCrmInboxConversations).mockImplementation(async (params) => {
      if (params.folderId) return folderPage;
      if (params.filter === "UNREAD") return unreadPage;
      return { items: [listed("chat-a", "Alice")], hasMore: false, nextCursor: null };
    });
    renderInbox(null, null, true);
    expect(await screen.findByRole("option", { name: /Alice/ })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "VIP, 2 unread messages" }));
    expect(screen.queryByRole("option", { name: /Alice/ })).not.toBeInTheDocument();
    resolveFolder({ items: [listed("chat-b", "Bob")], hasMore: false, nextCursor: null });
    expect(await screen.findByRole("option", { name: /Bob/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Unread · 2" }));
    expect(screen.queryByRole("option", { name: /Bob/ })).not.toBeInTheDocument();
    resolveUnread({ items: [listed("chat-c", "Carol")], hasMore: false, nextCursor: null });
    expect(await screen.findByRole("option", { name: /Carol/ })).toBeInTheDocument();
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

  it("reuses a two-minute in-memory inbox list without another page request", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const key = telegramCrmKeys.inboxConversationsList({
      filter: "ALL",
      search: undefined,
      limit: 50,
    });
    client.setQueryData(
      key,
      { pages: [{ items: [listed("cached-chat", "Cached contact")], nextCursor: null, hasMore: false }], pageParams: [null] },
      { updatedAt: Date.now() - 2 * 60_000 },
    );

    renderInbox(null, null, false, client);

    expect(await screen.findByRole("option", { name: /Cached contact/ })).toBeInTheDocument();
    expect(listCrmInboxConversations).not.toHaveBeenCalled();
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
      await screen.findByText("No records match these filters."),
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
    expect(telegramCrmApi.getChatContext).not.toHaveBeenCalled();
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
    expect(telegramCrmApi.getChatContext).toHaveBeenCalledWith(
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
