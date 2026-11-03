import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { CrmInboxConversationItem, CrmMessageListItem } from "@telegram-system/shared";
import { findInboxConversation, inboxItemMatches, mergeInboxFirstPage, patchInboxConversation, patchInboxMessage, type CrmInboxData } from "./crm-inbox-cache";
import { reconcileCrmMessage, telegramCrmKeys } from "./telegram-crm-query";

const item = (id = "dialog-a"): CrmInboxConversationItem => ({
  id, workspaceId: "workspace-a", contact: null,
  peer: { id: "peer-a", telegramUserId: "551234", username: "customer_a", firstName: "Anna", lastName: null, photoUrl: null },
  account: { id: "account-a", username: null, label: "Sales", photoUrl: null },
  state: "ACTIVE", lastMessageAt: "2026-10-20T12:00:00.000Z", lastInboundAt: "2026-10-20T12:00:00.000Z",
  lastOutboundAt: null, unreadCount: 2, ignoreInUnread: false, readState: "UNREAD", lastMessage: null,
});
const message = { id: "message-new", conversationId: "dialog-a", sentAt: "2026-10-21T12:00:00.000Z",
  text: "Incoming message", direction: "INBOUND", origin: "TELEGRAM_SYNC", readState: "UNREAD" } as CrmMessageListItem;
function seed(client: QueryClient, filter: "ALL" | "UNREAD" = "ALL") {
  const key = telegramCrmKeys.inboxConversationsList({ filter });
  client.setQueryData<CrmInboxData>(key, { pages: [{ items: [item()], nextCursor: "cursor", hasMore: true }], pageParams: [null] });
  return key;
}

describe("compact inbox cache", () => {
  it("excludes ignored chats only from Unread and restores them", () => {
    const client = new QueryClient(); seed(client); const unread = seed(client, "UNREAD");
    patchInboxConversation(client, "dialog-a", { ignoreInUnread: true });
    expect(client.getQueryData<CrmInboxData>(unread)?.pages[0].items).toEqual([]);
    expect(findInboxConversation(client, "dialog-a")?.ignoreInUnread).toBe(true);
    patchInboxConversation(client, "dialog-a", { ignoreInUnread: false });
    expect(client.getQueryData<CrmInboxData>(unread)?.pages[0].items).toHaveLength(1);
  });
  it("patches known messages and preserves server pagination without fabricating unopened history", () => {
    const client = new QueryClient(); const key = seed(client);
    expect(patchInboxMessage(client, message)).toBe(true);
    reconcileCrmMessage(client, message.conversationId, message);
    expect(client.getQueryData(telegramCrmKeys.messagesInfinite(message.conversationId))).toBeUndefined();
    expect(findInboxConversation(client, message.conversationId)?.lastMessage?.text).toBe(message.text);
    expect(client.getQueryData<CrmInboxData>(key)?.pages[0].nextCursor).toBe("cursor");
    expect(patchInboxMessage(client, { ...message, conversationId: "unknown" })).toBe(false);
  });
  it("removes read rows from unread views without altering unrelated dialogs", () => {
    const client = new QueryClient(); seed(client); const unread = seed(client, "UNREAD");
    patchInboxConversation(client, "dialog-a", { unreadCount: 0, readState: "READ" });
    expect(client.getQueryData<CrmInboxData>(unread)?.pages[0].items).toEqual([]);
    expect(findInboxConversation(client, "dialog-a")?.unreadCount).toBe(0);
    expect(findInboxConversation(client, "another-dialog")).toBeUndefined();
  });
  it("removes and restores conversations in unread-only Telegram folders as their unread state changes", () => {
    const client = new QueryClient();
    const all = telegramCrmKeys.inboxConversationsList({ filter: "ALL" });
    const folder = telegramCrmKeys.inboxConversationsList({ filter: "ALL", folderId: "folder-a" });
    const row = { ...item(), folders: [{ id: "folder-a", name: "Unread folder", color: null, excludeRead: true }] };
    for (const key of [all, folder]) client.setQueryData<CrmInboxData>(key, { pages: [{ items: [row], nextCursor: null, hasMore: false }], pageParams: [null] });
    patchInboxConversation(client, row.id, { unreadCount: 0, readState: "READ" });
    expect(client.getQueryData<CrmInboxData>(folder)?.pages[0].items).toEqual([]);
    expect(client.getQueryData<CrmInboxData>(all)?.pages[0].items[0].folders).toEqual(row.folders);
    patchInboxConversation(client, row.id, { unreadCount: 1, readState: "UNREAD" });
    expect(client.getQueryData<CrmInboxData>(folder)?.pages[0].items.map((entry) => entry.id)).toEqual([row.id]);
  });
  it("does not replace the latest preview with an older edit", () => {
    const client = new QueryClient(); seed(client); patchInboxMessage(client, message);
    patchInboxMessage(client, { ...message, id: "older", text: "Old edit", sentAt: "2026-10-19T12:00:00.000Z" });
    expect(findInboxConversation(client, "dialog-a")?.lastMessage?.id).toBe(message.id);
  });
  it("inserts a known row when it enters a cached empty unread or needs-reply view", () => {
    const client = new QueryClient(); seed(client);
    patchInboxConversation(client, "dialog-a", { unreadCount: 0, lastOutboundAt: "2026-10-22T12:00:00.000Z" });
    for (const filter of ["UNREAD", "NEEDS_REPLY"] as const) client.setQueryData<CrmInboxData>(telegramCrmKeys.inboxConversationsList({ filter }), {
      pages: [{ items: [], nextCursor: null, hasMore: false }], pageParams: [null],
    });
    patchInboxMessage(client, { ...message, sentAt: "2026-10-23T12:00:00.000Z" });
    patchInboxConversation(client, "dialog-a", { unreadCount: 1 });
    for (const filter of ["UNREAD", "NEEDS_REPLY"] as const) expect(client.getQueryData<CrmInboxData>(telegramCrmKeys.inboxConversationsList({ filter }))?.pages[0].items.map((row) => row.id)).toEqual(["dialog-a"]);
  });
  it("keeps needs-reply, due follow-up, archived and AI semantics explicit", () => {
    expect(inboxItemMatches(item(), { filter: "NEEDS_REPLY" })).toBe(true);
    expect(inboxItemMatches({ ...item(), lastOutboundAt: "2026-10-21T12:00:00.000Z" }, { filter: "NEEDS_REPLY" })).toBe(false);
    expect(inboxItemMatches(item(), { filter: "AI_LEADS" })).toBe(false);
    expect(inboxItemMatches({ ...item(), state: "ARCHIVED" }, { filter: "ALL" })).toBe(false);
    expect(inboxItemMatches(item(), { filter: "FOLLOW_UP" })).toBe(false);
    expect(inboxItemMatches(item(), { filter: "ALL", search: "@customer" })).toBe(true);
  });
  it("keeps loaded tail rows and cursors when a refreshed first page moves existing rows", () => {
    const current: CrmInboxData = { pages: [
      { items: [item("one"), item("two")], nextCursor: "first-boundary", hasMore: true },
      { items: [item("three"), item("four")], nextCursor: "tail-boundary", hasMore: true },
    ], pageParams: [null, "first-boundary"] };
    const result = mergeInboxFirstPage(current, { items: [item("new"), item("three")], nextCursor: "new-boundary", hasMore: true });
    expect(result.pages.flatMap((page) => page.items.map((row) => row.id))).toEqual(["new", "three", "one", "two", "four"]);
    expect(result.pages[1].nextCursor).toBe("tail-boundary");
    expect(result.pageParams).toEqual(current.pageParams);
  });
  it("can insert a searched filter entry by the CRM contact handle when the peer handle differs", () => {
    const client = new QueryClient(); const key = seed(client);
    client.setQueryData<CrmInboxData>(key, { pages: [{ items: [{ ...item(), contact: { id: "client-a", displayName: "Client", telegramUsername: "client_handle", stage: "LEAD", nextContactAt: null } }], nextCursor: null, hasMore: false }], pageParams: [null] });
    const searched = telegramCrmKeys.inboxConversationsList({ filter: "UNREAD", search: "@client_handle" });
    client.setQueryData<CrmInboxData>(searched, { pages: [{ items: [], nextCursor: null, hasMore: false }], pageParams: [null] });
    patchInboxConversation(client, "dialog-a", { unreadCount: 3 });
    expect(client.getQueryData<CrmInboxData>(searched)?.pages[0].items[0].id).toBe("dialog-a");
  });
});
