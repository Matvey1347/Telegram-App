import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  CrmConversationListItem,
  CrmMessageListItem,
} from "@telegram-system/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crmChatActionsApi } from "@/lib/features/growth/crm-chat-actions-api";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import { authApi, telegramChannelsApi } from "@/lib/api";
import { TestI18nProvider } from "@/test/render-with-i18n";
import { CrmMessageThread } from "./crm-message-thread";

vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ pushToast: vi.fn(), setProgress: vi.fn(), clearProgress: vi.fn() }),
}));

const conversation = {
  id: "conversation-1",
  workspaceId: "workspace-1",
  contactId: "contact-1",
  mtprotoAccountId: "account-1",
  historyExhausted: true,
  unreadCount: 0,
  account: {
    id: "account-1",
    label: "Telegram manager",
    username: "tgManage770",
    photoUrl: "https://cdn.example/manager.jpg",
  },
} as CrmConversationListItem;

const onlyMessage = {
  id: "message-1",
  workspaceId: "workspace-1",
  conversationId: conversation.id,
  telegramMessageId: "1",
  telegramMessageIdNumeric: 1,
  clientIdempotencyKey: null,
  mtprotoAccountId: conversation.mtprotoAccountId,
  direction: "INBOUND",
  origin: "TELEGRAM_SYNC",
  sentByMemberId: null,
  text: "Only saved message",
  contentMetadata: null,
  sentAt: "2026-09-06T12:00:00.000Z",
  editedAt: null,
  readState: "READ",
  deliveryState: "DELIVERED",
  createdAt: "2026-09-06T12:00:00.000Z",
  account: conversation.account,
  sentByMember: null,
} as CrmMessageListItem;

afterEach(() => vi.unstubAllGlobals());

function enterComposerText(text: string) {
  const input = screen.getByRole("textbox", { name: "Message text" });
  input.textContent = text;
  fireEvent.input(input);
}

describe("CrmMessageThread header", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    localStorage.clear();
    vi.spyOn(crmChatActionsApi, "capabilities").mockResolvedValue({ canReply: false, canEdit: false, canDelete: false, canDeleteForEveryone: false, canReact: false, canForward: false, canUpload: false, canSendVoice: false, maxUploadBytes: 10485760, voiceMimeTypes: [], reactionEmoji: [] });
    vi.spyOn(authApi, "me").mockResolvedValue({ user: {}, workspace: { id: "workspace-1" } } as never);
    vi.spyOn(telegramCrmApi, "listMessages").mockResolvedValue({
      items: [],
      nextCursor: null,
      hasMore: false,
    });
    vi.spyOn(telegramCrmApi, "importHistory").mockResolvedValue({ conversationId: conversation.id, imported: 0, scanned: 0, nextBeforeTelegramMessageId: null, exhausted: true });
  });

  it("does not repeat the MTProto account text above the messages", async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={client}>
        <CrmMessageThread conversation={conversation} canSendManual={false} />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText("No messages in this conversation yet."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Replies stay on this Telegram account."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("via @tgManage770")).not.toBeInTheDocument();
  });

  it("shows an automatic reconciliation failure with a retry while retaining saved messages", async () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ top: 0, bottom: 100, left: 0, right: 100, width: 100, height: 100, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    vi.spyOn(telegramCrmApi, "importHistory").mockRejectedValue({ response: { status: 409, data: { message: "Telegram CRM runtime is active in another application instance. Retry shortly." } } });
    vi.mocked(telegramCrmApi.listMessages).mockResolvedValue({ items: [onlyMessage], nextCursor: null, hasMore: false });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const markRead = vi.spyOn(telegramCrmApi, "markConversationRead");
    render(<QueryClientProvider client={client}><CrmMessageThread conversation={{ ...conversation, unreadCount: 1 }} canSendManual={false} /></QueryClientProvider>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось обновить сообщения из Telegram");
    expect(screen.getByText("Only saved message")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Повторить синхронизацию" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Refresh recent messages" })).not.toBeInTheDocument();
    expect(markRead).not.toHaveBeenCalled();
  });

  it("marks a visible message read only after recent Telegram history succeeds", async () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ top: 0, bottom: 100, left: 0, right: 100, width: 100, height: 100, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    vi.mocked(telegramCrmApi.listMessages).mockResolvedValue({ items: [onlyMessage], nextCursor: null, hasMore: false });
    let resolveHistory!: (value: Awaited<ReturnType<typeof telegramCrmApi.importHistory>>) => void;
    vi.mocked(telegramCrmApi.importHistory).mockReturnValueOnce(new Promise((resolve) => { resolveHistory = resolve; }));
    const markRead = vi.spyOn(telegramCrmApi, "markConversationRead").mockResolvedValue({ conversationId: conversation.id, lastReadInboxTelegramMessageId: 1, readMessageCount: 1, unreadCount: 0 });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><CrmMessageThread conversation={{ ...conversation, unreadCount: 1 }} canSendManual={false} /></QueryClientProvider>);
    await screen.findByText("Only saved message");
    await waitFor(() => expect(telegramCrmApi.importHistory).toHaveBeenCalled());
    expect(markRead).not.toHaveBeenCalled();
    await act(async () => resolveHistory({ conversationId: conversation.id, imported: 0, scanned: 0, nextBeforeTelegramMessageId: null, exhausted: true }));
    await waitFor(() => expect(markRead).toHaveBeenCalledExactlyOnceWith(conversation.id, 1));
  });

  it("waits while the client details panel covers the chat and resumes when it closes", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ top: 0, bottom: 100, left: 0, right: 100, width: 100, height: 100, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    vi.mocked(telegramCrmApi.listMessages).mockResolvedValue({ items: [onlyMessage], nextCursor: null, hasMore: false });
    const markRead = vi.spyOn(telegramCrmApi, "markConversationRead").mockResolvedValue({ conversationId: conversation.id, lastReadInboxTelegramMessageId: 1, readMessageCount: 1, unreadCount: 0 });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const tree = (detailsOpen: boolean) => <QueryClientProvider client={client}><CrmMessageThread conversation={{ ...conversation, unreadCount: 1 }} canSendManual={false} detailsOpen={detailsOpen} /></QueryClientProvider>;
    const view = render(tree(true));
    await screen.findByText("Only saved message");
    await waitFor(() => expect(telegramCrmApi.importHistory).toHaveBeenCalled());
    expect(markRead).not.toHaveBeenCalled();
    view.rerender(tree(false));
    await waitFor(() => expect(markRead).toHaveBeenCalledExactlyOnceWith(conversation.id, 1));
  });

  it("marks the visible chat read while desktop client details are open inline", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ top: 0, bottom: 100, left: 0, right: 100, width: 100, height: 100, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    vi.mocked(telegramCrmApi.listMessages).mockResolvedValue({ items: [onlyMessage], nextCursor: null, hasMore: false });
    const markRead = vi.spyOn(telegramCrmApi, "markConversationRead").mockResolvedValue({ conversationId: conversation.id, lastReadInboxTelegramMessageId: 1, readMessageCount: 1, unreadCount: 0 });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><CrmMessageThread conversation={{ ...conversation, unreadCount: 1 }} canSendManual={false} detailsOpen /></QueryClientProvider>);
    await waitFor(() => expect(markRead).toHaveBeenCalledExactlyOnceWith(conversation.id, 1));
  });

  it("resumes reading if the open mobile details panel becomes a desktop sidebar", async () => {
    let mobile = true;
    const listeners = new Set<() => void>();
    vi.stubGlobal("matchMedia", () => ({ get matches() { return mobile; }, addEventListener: (_: string, callback: () => void) => listeners.add(callback), removeEventListener: (_: string, callback: () => void) => listeners.delete(callback) }));
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ top: 0, bottom: 100, left: 0, right: 100, width: 100, height: 100, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    vi.mocked(telegramCrmApi.listMessages).mockResolvedValue({ items: [onlyMessage], nextCursor: null, hasMore: false });
    const markRead = vi.spyOn(telegramCrmApi, "markConversationRead").mockResolvedValue({ conversationId: conversation.id, lastReadInboxTelegramMessageId: 1, readMessageCount: 1, unreadCount: 0 });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><CrmMessageThread conversation={{ ...conversation, unreadCount: 1 }} canSendManual={false} detailsOpen /></QueryClientProvider>);
    await screen.findByText("Only saved message");
    await waitFor(() => expect(telegramCrmApi.importHistory).toHaveBeenCalled());
    expect(markRead).not.toHaveBeenCalled();
    act(() => { mobile = false; listeners.forEach((callback) => callback()); });
    await waitFor(() => expect(markRead).toHaveBeenCalledExactlyOnceWith(conversation.id, 1));
  });

  it.each([
    ["More formatting", "Done"],
  ])("waits while %s is open and resumes on close", async (openLabel, closeLabel) => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ top: 0, bottom: 100, left: 0, right: 100, width: 100, height: 100, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    vi.mocked(telegramCrmApi.listMessages).mockResolvedValue({ items: [onlyMessage], nextCursor: null, hasMore: false });
    const markRead = vi.spyOn(telegramCrmApi, "markConversationRead").mockResolvedValue({ conversationId: conversation.id, lastReadInboxTelegramMessageId: 1, readMessageCount: 1, unreadCount: 0 });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const tree = (unreadCount: number) => <QueryClientProvider client={client}><TestI18nProvider><CrmMessageThread conversation={{ ...conversation, unreadCount }} canSendManual /></TestI18nProvider></QueryClientProvider>;
    const view = render(tree(0));
    await screen.findByText("Only saved message");
    await waitFor(() => expect(telegramCrmApi.importHistory).toHaveBeenCalled());
    await userEvent.click(screen.getByRole("button", { name: "Formatting" }));
    await userEvent.click(screen.getByRole("button", { name: openLabel }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    view.rerender(tree(1));
    expect(markRead).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: closeLabel }));
    await waitFor(() => expect(markRead).toHaveBeenCalledExactlyOnceWith(conversation.id, 1));
  });

  it("reserves the message viewport while the conversation is loading", () => {
    vi.spyOn(telegramCrmApi, "listMessages").mockReturnValue(
      new Promise(() => undefined),
    );
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={client}>
        <TestI18nProvider>
          <CrmMessageThread conversation={conversation} canSendManual />
        </TestI18nProvider>
      </QueryClientProvider>,
    );

    const loading = screen.getByText("Loading messages…");
    expect(loading.parentElement).toHaveClass("flex-1");
    expect(screen.getByRole("textbox", { name: "Message text" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("button", { name: "Send message" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Formatting" })).toBeDisabled();
  });

  it("keeps sending disabled when the first history request fails", async () => {
    vi.mocked(telegramCrmApi.listMessages).mockRejectedValue(new Error("History is unavailable"));
    const send = vi.spyOn(telegramCrmApi, "sendManualMessage");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><TestI18nProvider><CrmMessageThread conversation={conversation} canSendManual /></TestI18nProvider></QueryClientProvider>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Messages could not be loaded");
    expect(screen.getByRole("textbox", { name: "Message text" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("button", { name: "Send message" })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Message text" }), { key: "Enter", ctrlKey: true });
    expect(send).not.toHaveBeenCalled();
  });

  it("clears the canonical composer draft when a failed bubble retry succeeds", async () => {
    const send = vi.spyOn(telegramCrmApi, "sendManualMessage")
      .mockRejectedValueOnce({ response: { status: 429, data: { message: "Rate limited before sending" } } })
      .mockImplementationOnce(async (_id, payload) => ({
        message: { ...onlyMessage, id: "sent-retry", direction: "OUTBOUND", origin: "MANUAL", text: payload.text, clientIdempotencyKey: payload.clientIdempotencyKey, deliveryState: "SENT" },
        idempotentReplay: true,
      }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const tree = <QueryClientProvider client={client}><TestI18nProvider><CrmMessageThread conversation={conversation} canSendManual /></TestI18nProvider></QueryClientProvider>;
    const view = render(tree);
    await screen.findByText("No messages in this conversation yet.");
    enterComposerText("Retry this saved draft");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));
    await userEvent.click(await screen.findByRole("button", { name: "Retry send" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Message text" })).toHaveTextContent(""));
    expect(send.mock.calls[0][1].clientIdempotencyKey).toBe(send.mock.calls[1][1].clientIdempotencyKey);
    expect(localStorage.getItem(`crm-message:${conversation.id}:${conversation.workspaceId}`)).toBeNull();
    view.unmount();
    render(tree);
    expect(screen.queryByText("Saved drafts")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message text" })).toHaveTextContent("");
  });

  it("cleans the old draft when retry finishes after switching conversations and preserves the new draft", async () => {
    let resolveRetry!: (value: Awaited<ReturnType<typeof telegramCrmApi.sendManualMessage>>) => void;
    const send = vi.spyOn(telegramCrmApi, "sendManualMessage")
      .mockRejectedValueOnce({ response: { status: 429, data: { message: "Rate limited before sending" } } })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRetry = resolve; }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const tree = (selected: CrmConversationListItem) => <QueryClientProvider client={client}><TestI18nProvider><CrmMessageThread conversation={selected} canSendManual /></TestI18nProvider></QueryClientProvider>;
    const view = render(tree(conversation));
    await screen.findByText("No messages in this conversation yet.");
    enterComposerText("Old chat pending retry");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));
    await userEvent.click(await screen.findByRole("button", { name: "Retry send" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    const retryKey = send.mock.calls[1][1].clientIdempotencyKey;
    const next = { ...conversation, id: "other-conversation", workspaceId: "other-workspace" };
    view.rerender(tree(next));
    await screen.findByText("No messages in this conversation yet.");
    enterComposerText("Keep the new conversation draft");
    await act(async () => resolveRetry({ message: { ...onlyMessage, id: "sent-old-retry", direction: "OUTBOUND", origin: "MANUAL", text: "Old chat pending retry", clientIdempotencyKey: retryKey, deliveryState: "SENT" }, idempotentReplay: true }));
    await waitFor(() => expect(localStorage.getItem(`crm-message:${conversation.id}:${conversation.workspaceId}`)).toBeNull());
    expect(localStorage.getItem(`crm-message:${next.id}:${next.workspaceId}`)).toContain("Keep the new conversation draft");
    expect(screen.getByRole("textbox", { name: "Message text" })).toHaveTextContent("Keep the new conversation draft");
    view.rerender(tree(conversation));
    expect(screen.queryByText("Saved drafts")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message text" })).toHaveTextContent("");
  });

  it("automatically reconciles recent messages, then imports older history at the DB boundary", async () => {
    vi.mocked(telegramCrmApi.listMessages).mockResolvedValue({
      items: [
        { ...onlyMessage, id: "message-2", telegramMessageId: "2" },
        onlyMessage,
      ],
      nextCursor: null,
      hasMore: false,
    });
    const importHistory = vi
      .spyOn(telegramCrmApi, "importHistory")
      .mockResolvedValueOnce({
        conversationId: conversation.id,
        imported: 0,
        scanned: 100,
        nextBeforeTelegramMessageId: 101,
        exhausted: false,
      }).mockResolvedValue({
        conversationId: conversation.id,
        imported: 0,
        scanned: 1,
        nextBeforeTelegramMessageId: null,
        exhausted: true,
      });
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={client}>
        <CrmMessageThread
          conversation={{ ...conversation, historyExhausted: false }}
          canSendManual={false}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findAllByText("Only saved message")).toHaveLength(2);
    await waitFor(() => expect(importHistory).toHaveBeenCalledWith(conversation.id, { limit: 100, recent: true }));
    const loadOlder = await screen.findByRole("button", { name: "Load older messages" });
    await waitFor(() => expect(loadOlder).not.toBeDisabled());
    fireEvent.click(loadOlder);
    await waitFor(() =>
      expect(importHistory).toHaveBeenCalledWith(conversation.id, {
        limit: 51,
        beforeTelegramMessageId: 101,
      }),
    );
  });

  it("keeps one contextual action menu for incoming and outgoing messages", async () => {
    vi.mocked(telegramCrmApi.listMessages).mockResolvedValue({
      items: [
        { ...onlyMessage, id: "outbound-1", text: "First", direction: "OUTBOUND" },
        { ...onlyMessage, id: "inbound-2", text: "Second", direction: "INBOUND" },
      ],
      nextCursor: null,
      hasMore: false,
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <CrmMessageThread conversation={conversation} canSendManual={false} />
      </QueryClientProvider>,
    );

    const actionButtons = await screen.findAllByRole("button", {
      name: "Message actions",
    });
    fireEvent.click(actionButtons[0]);
    expect(screen.getAllByRole("menuitem", { name: "Copy text" })).toHaveLength(1);

    fireEvent.click(actionButtons[1]);
    expect(screen.getAllByRole("menuitem", { name: "Copy text" })).toHaveLength(1);
    expect(actionButtons[0]).toHaveAttribute("aria-expanded", "false");
    expect(actionButtons[1]).toHaveAttribute("aria-expanded", "true");
  });

  it("loads workspace Premium emoji only after the CRM picker switches tabs", async () => {
    const customEmojiPacks = vi
      .spyOn(telegramChannelsApi, "customEmojiPacks")
      .mockResolvedValue({ packs: [] });
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={client}>
        <TestI18nProvider>
          <CrmMessageThread conversation={conversation} canSendManual />
        </TestI18nProvider>
      </QueryClientProvider>,
    );

    await screen.findByText("No messages in this conversation yet.");
    fireEvent.click(screen.getByRole("button", { name: "Formatting" }));
    fireEvent.click(screen.getByRole("button", { name: "More formatting" }));
    fireEvent.click(screen.getByRole("button", { name: "Emoji" }));
    expect(customEmojiPacks).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Premium" }));
    await waitFor(() => expect(customEmojiPacks).toHaveBeenCalledOnce());
  });
  it("does not retry a send after a timeout and clears only after GET receipt confirmation", async () => {
    const send = vi.spyOn(telegramCrmApi, "sendManualMessage").mockRejectedValue(new Error("HTTP timeout"));
    const receipt = vi.spyOn(telegramCrmApi, "getManualSendReceipt").mockResolvedValueOnce(null).mockImplementationOnce(async (_id, key) => ({ message: { ...onlyMessage, id: "confirmed-unknown", text: "Uncertain send", direction: "OUTBOUND", origin: "MANUAL", clientIdempotencyKey: key, deliveryState: "SENT" }, idempotentReplay: true }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><TestI18nProvider><CrmMessageThread conversation={conversation} canSendManual /></TestI18nProvider></QueryClientProvider>);
    await screen.findByText("No messages in this conversation yet.");
    enterComposerText("Uncertain send");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText(/Send result is unknown/);
    expect(screen.queryByRole("button", { name: "Retry send" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Check send result" }));
    await waitFor(() => expect(receipt).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Message text" })).toHaveTextContent("Uncertain send");
    await userEvent.click(screen.getByRole("button", { name: "Check send result" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Message text" })).toHaveTextContent(""));
    expect(send).toHaveBeenCalledOnce();
    expect(receipt.mock.calls[0][1]).toBe(send.mock.calls[0][1].clientIdempotencyKey);
  });

});
