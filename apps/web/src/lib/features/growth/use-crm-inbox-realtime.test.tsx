import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PropsWithChildren } from "react";
import type { CrmInboxConversationItem, CrmMessageListItem, CrmMessagesCursorPage, CrmRealtimeEvent } from "@telegram-system/shared";
import type { InfiniteData } from "@tanstack/react-query";
import { useCrmInboxRealtime } from "./use-crm-inbox-realtime";
import { telegramCrmKeys } from "./telegram-crm-query";
import { listCrmInboxConversations } from "./crm-inbox-api";
import type { CrmInboxData } from "./crm-inbox-cache";

let handlers: Parameters<typeof import("./use-telegram-crm-realtime").useTelegramCrmRealtime>[0];
vi.mock("./use-telegram-crm-realtime", () => ({ useTelegramCrmRealtime: (value: typeof handlers) => { handlers = value; return "connected"; } }));
vi.mock("./crm-inbox-api", () => ({ listCrmInboxConversations: vi.fn() }));
const row = { id: "conversation-a", workspaceId: "workspace-a", state: "ACTIVE", contact: null, unreadCount: 2,
  lastMessageAt: "2026-10-10T10:00:00Z", lastInboundAt: "2026-10-10T10:00:00Z", lastOutboundAt: null } as CrmInboxConversationItem;
const message = { id: "message-a", conversationId: row.id, workspaceId: row.workspaceId, direction: "INBOUND",
  text: "New message", sentAt: "2026-10-20T10:00:00Z", readState: "UNREAD", origin: "TELEGRAM_SYNC" } as CrmMessageListItem;
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const key = telegramCrmKeys.inboxConversationsList({ filter: "ALL" });
  client.setQueryData<CrmInboxData>(key, { pages: [{ items: [row], nextCursor: null, hasMore: false }], pageParams: [null] });
  client.setQueryData(telegramCrmKeys.unread(), { total: 2, inbox: 2, contacts: 0 });
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(() => {
    useQuery({ queryKey: key, queryFn: () => Promise.reject(new Error("unexpected refetch")), staleTime: Infinity });
    return useCrmInboxRealtime("workspace-a", true);
  }, { wrapper });
  return { client, key, ...hook };
}
const event = (patch: Partial<CrmRealtimeEvent> = {}): CrmRealtimeEvent => ({ type: "message.received", workspaceId: "workspace-a", occurredAt: message.sentAt,
  conversationId: row.id, contactId: null, ownerMemberId: null, message, ...patch } as CrmRealtimeEvent);

describe("CRM realtime integration", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.mocked(listCrmInboxConversations).mockResolvedValue({ items: [row], nextCursor: null, hasMore: false }); });
  afterEach(() => { vi.clearAllMocks(); vi.useRealTimers(); });
  it("patches known message payloads and deduplicates edits without list refetch or fake history", () => {
    const { client } = setup();
    act(() => handlers.onEvent(event()));
    expect(listCrmInboxConversations).not.toHaveBeenCalled();
    expect(client.getQueryData(telegramCrmKeys.messagesInfinite(row.id))).toBeUndefined();
    client.setQueryData<InfiniteData<CrmMessagesCursorPage>>(telegramCrmKeys.messagesInfinite(row.id), { pages: [{ items: [message], nextCursor: "older", hasMore: true }], pageParams: [null] });
    act(() => { handlers.onEvent(event({ type: "message.updated", message: { ...message, text: "Edited" } })); handlers.onEvent(event({ type: "message.updated", message: { ...message, text: "Edited" } })); });
    const data = client.getQueryData<InfiniteData<CrmMessagesCursorPage>>(telegramCrmKeys.messagesInfinite(row.id));
    expect(data?.pages[0].items).toHaveLength(1); expect(data?.pages[0].items[0].text).toBe("Edited"); expect(data?.pages[0].nextCursor).toBe("older");
  });
  it("ignores foreign-workspace events and applies authoritative read counts once", () => {
    const { client } = setup(); act(() => handlers.onEvent(event({ workspaceId: "another-workspace" })));
    const read = { type: "readChanged", workspaceId: "workspace-a", occurredAt: message.sentAt, conversationId: row.id, contactId: null, ownerMemberId: null, unreadCount: 0 } as CrmRealtimeEvent;
    act(() => { handlers.onEvent(read); handlers.onEvent(read); });
    expect(client.getQueryData(telegramCrmKeys.unread())).toEqual({ total: 0, inbox: 0, contacts: 0 });
    expect(listCrmInboxConversations).not.toHaveBeenCalled();
  });
  it("patches a known client's manual decision and due date without a full Inbox refetch", () => {
    const { client, key } = setup();
    client.setQueryData<CrmInboxData>(key, { pages: [{ items: [{ ...row, contact: { id: "client-a", displayName: "Client", stage: "LEAD", nextContactAt: null } }], nextCursor: "tail", hasMore: true }], pageParams: [null] });
    act(() => handlers.onEvent({ type: "contact.updated", workspaceId: "workspace-a", occurredAt: message.sentAt, contactId: "client-a", ownerMemberId: null, manualSalesStatus: "CLOSED", nextContactAt: null }));
    expect(client.getQueryData<CrmInboxData>(key)?.pages[0].items[0].attentionStatus).toBe("CLOSED");
    expect(client.getQueryData<CrmInboxData>(key)?.pages[0].nextCursor).toBe("tail");
    expect(listCrmInboxConversations).not.toHaveBeenCalled();
  });
  it("reconciles workflow snapshots on reconnect without invalidating purchases or the package catalog", () => {
    const { client } = setup();
    const invalidation = vi.spyOn(client, "invalidateQueries");
    act(() => handlers.onReconnect?.());
    expect(invalidation).toHaveBeenCalledWith({ queryKey: telegramCrmKeys.salesWorkflows(), refetchType: "active" });
    expect(invalidation.mock.calls.some(([filter]) => filter?.queryKey?.includes("purchases") || filter?.queryKey?.includes("package-sales-context"))).toBe(false);
  });
  it("coalesces unknown conversations and cancels pending reconciliation on unmount", async () => {
    const { unmount } = setup();
    act(() => { handlers.onEvent(event({ conversationId: "unknown", message: { ...message, conversationId: "unknown" } })); handlers.onEvent(event({ conversationId: "unknown", message: { ...message, conversationId: "unknown" } })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    expect(listCrmInboxConversations).toHaveBeenCalledOnce();
    act(() => handlers.onReconnect?.()); unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(listCrmInboxConversations).toHaveBeenCalledOnce();
  });
  it("patches edits/reactions without advancing unread, timestamps or attention", () => {
    const { client, key } = setup();
    const original = { ...row, lastMessage: message, attentionStatus: "NEEDS_REPLY" as const };
    client.setQueryData<CrmInboxData>(key, { pages: [{ items: [original], nextCursor: null, hasMore: false }], pageParams: [null] });
    act(() => handlers.onEvent(event({ type: "message.updated", message: { ...message, text: "Edited", contentMetadata: { reactions: [{ emoji: "👍", count: 1, chosen: true }] } } })));
    const current = client.getQueryData<CrmInboxData>(key)?.pages[0].items[0];
    expect(current?.lastMessage?.text).toBe("Edited"); expect(current?.lastInboundAt).toBe(row.lastInboundAt);
    expect(current?.lastMessageAt).toBe(row.lastMessageAt); expect(current?.unreadCount).toBe(row.unreadCount); expect(current?.attentionStatus).toBe("NEEDS_REPLY");
    expect(listCrmInboxConversations).not.toHaveBeenCalled();
  });
  it("tombstones deletion and prevents a delayed edit from resurrecting history", () => {
    const { client } = setup();
    client.setQueryData<InfiniteData<CrmMessagesCursorPage>>(telegramCrmKeys.messagesInfinite(row.id), { pages: [{ items: [message], nextCursor: "older", hasMore: true }], pageParams: [null] });
    act(() => handlers.onEvent({ type: "message.deleted", workspaceId: row.workspaceId, occurredAt: message.sentAt, conversationId: row.id, contactId: null, ownerMemberId: null, messageIds: [message.id], unreadCount: 1, lastMessage: null, lastMessageAt: null }));
    act(() => handlers.onEvent(event({ type: "message.updated", message: { ...message, text: "Late edit" } })));
    const current = client.getQueryData<InfiniteData<CrmMessagesCursorPage>>(telegramCrmKeys.messagesInfinite(row.id))?.pages[0];
    expect(current?.items[0].deletedAt).toBeTruthy(); expect(current?.items[0].text).toBeNull(); expect(current?.nextCursor).toBe("older");
  });

});
