import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import type {
  CrmContactDetail,
  CrmConversationListItem,
  CrmInboxListResult,
  CrmMessageListItem,
  CrmMessagesCursorPage,
} from "@telegram-system/shared";
import { describe, expect, it } from "vitest";
import {
  appendCrmMessage,
  reconcileCrmConversationUnread,
  reconcileCrmMessage,
  removeCrmInboxPeer,
  markOptimisticCrmMessageFailed,
  telegramCrmKeys,
} from "./telegram-crm-query";

function message(id: string, key: string | null, deliveryState: CrmMessageListItem["deliveryState"]): CrmMessageListItem {
  return {
    id,
    workspaceId: "workspace-1",
    conversationId: "conversation-1",
    telegramMessageId: id,
    telegramMessageIdNumeric: null,
    clientIdempotencyKey: key,
    mtprotoAccountId: "account-1",
    direction: "OUTBOUND",
    origin: "MANUAL",
    sentByMemberId: null,
    text: "Hello",
    contentMetadata: null,
    sentAt: "2026-08-31T12:00:00.000Z",
    editedAt: null,
    readState: "UNKNOWN",
    deliveryState,
    createdAt: "2026-08-31T12:00:00.000Z",
    account: { id: "account-1", label: "Sales", username: "sales", photoUrl: null },
    sentByMember: null,
  };
}

describe("telegramCrm cache contract", () => {
  it("keeps list, detail, inbox and histories in distinct key families", () => {
    expect(telegramCrmKeys.contactLists()).not.toEqual(telegramCrmKeys.contactDetails());
    expect(telegramCrmKeys.inboxLists()).not.toEqual(telegramCrmKeys.conversationLists());
    expect(telegramCrmKeys.messagesInfinite("c1")).not.toEqual(telegramCrmKeys.unread());
  });

  it("removes only the promoted inbox peer", () => {
    const client = new QueryClient();
    const key = telegramCrmKeys.inboxList({ page: 1, pageSize: 50, state: "ACTIVE" });
    const peer = (id: string) => ({ id, workspaceId: "w1", telegramUserId: id, contactId: null, username: null, firstName: null, lastName: null, photoUrl: null, createdAt: "now", updatedAt: "now" });
    client.setQueryData<CrmInboxListResult>(key, {
      items: ["p1", "p2"].map((id) => ({ peer: peer(id), conversationCount: 0, unreadCount: 0, conversations: [], latestConversation: null })),
      pagination: { page: 1, pageSize: 50, totalItems: 2, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    removeCrmInboxPeer(client, "p1");
    expect(client.getQueryData<CrmInboxListResult>(key)?.items.map((item) => item.peer.id)).toEqual(["p2"]);
  });

  it("reconciles one optimistic row and retains one failed row for idempotent retry", () => {
    const client = new QueryClient();
    const key = telegramCrmKeys.messagesInfinite("conversation-1");
    client.setQueryData<InfiniteData<CrmMessagesCursorPage, string | null>>(key, {
      pages: [{ items: [message("existing", "old", "SENT")], nextCursor: null, hasMore: false }],
      pageParams: [null],
    });
    appendCrmMessage(client, "conversation-1", message("optimistic:key-1", "key-1", "PENDING"));
    reconcileCrmMessage(client, "conversation-1", message("server-1", "key-1", "SENT"));
    let items = client.getQueryData<InfiniteData<CrmMessagesCursorPage, string | null>>(key)!.pages[0]!.items;
    expect(items.map((item) => item.id)).toEqual(["existing", "server-1"]);
    appendCrmMessage(client, "conversation-1", message("optimistic:key-2", "key-2", "PENDING"));
    markOptimisticCrmMessageFailed(client, "conversation-1", "key-2");
    items = client.getQueryData<InfiniteData<CrmMessagesCursorPage, string | null>>(key)!.pages[0]!.items;
    expect(items.map((item) => item.id)).toEqual(["existing", "server-1", "optimistic:key-2"]);
    expect(items.at(-1)?.deliveryState).toBe("FAILED");
  });

  it("applies mark-read once when SSE arrives before the HTTP response", () => {
    const client = new QueryClient();
    client.setQueryData<CrmConversationListItem>(
      telegramCrmKeys.conversationDetail("conversation-1"),
      { id: "conversation-1", unreadCount: 3 } as CrmConversationListItem,
    );
    client.setQueryData<CrmContactDetail>(
      telegramCrmKeys.contactDetail("contact-1"),
      { id: "contact-1", unreadCount: 5 } as CrmContactDetail,
    );

    reconcileCrmConversationUnread(
      client,
      "conversation-1",
      "contact-1",
      0,
      3,
    );
    reconcileCrmConversationUnread(
      client,
      "conversation-1",
      "contact-1",
      0,
      3,
    );

    expect(
      client.getQueryData<CrmConversationListItem>(
        telegramCrmKeys.conversationDetail("conversation-1"),
      )?.unreadCount,
    ).toBe(0);
    expect(
      client.getQueryData<CrmContactDetail>(
        telegramCrmKeys.contactDetail("contact-1"),
      )?.unreadCount,
    ).toBe(2);
  });

  it("collapses a live MTProto echo and its optimistic row into one authoritative message", () => {
    const client = new QueryClient();
    const key = telegramCrmKeys.messagesInfinite("conversation-1");
    client.setQueryData<InfiniteData<CrmMessagesCursorPage, string | null>>(key, {
      pages: [{ items: [], nextCursor: null, hasMore: false }],
      pageParams: [null],
    });
    appendCrmMessage(
      client,
      "conversation-1",
      message("optimistic:key-1", "key-1", "PENDING"),
    );
    appendCrmMessage(
      client,
      "conversation-1",
      message("server-1", null, "SENT"),
    );

    reconcileCrmMessage(
      client,
      "conversation-1",
      message("server-1", "key-1", "SENT"),
    );

    const items = client.getQueryData<
      InfiniteData<CrmMessagesCursorPage, string | null>
    >(key)!.pages.flatMap((page) => page.items);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "server-1",
      clientIdempotencyKey: "key-1",
      deliveryState: "SENT",
    });
  });
});
