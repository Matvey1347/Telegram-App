import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { CrmConversationListItem, CrmMessageListItem } from "@telegram-system/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { useCrmThread } from "./use-crm-thread";

const conversation = {
  id: "customer-chat", workspaceId: "workspace-a", contactId: "customer-a",
  mtprotoAccountId: "sender-a", historyExhausted: true, unreadCount: 2,
} as CrmConversationListItem;
const sentMessage = (text: string, key: string): CrmMessageListItem => ({
  id: "saved-message", workspaceId: conversation.workspaceId, conversationId: conversation.id,
  telegramMessageId: "500", telegramMessageIdNumeric: 500, clientIdempotencyKey: key,
  mtprotoAccountId: conversation.mtprotoAccountId, direction: "OUTBOUND", origin: "MANUAL",
  text, contentMetadata: null, sentAt: "2026-10-30T12:00:00.000Z", editedAt: null,
  readState: "UNKNOWN", deliveryState: "SENT", createdAt: "2026-10-30T12:00:00.000Z",
  sentByMemberId: null, sentByMember: null,
});
const setup = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { ...renderHook(() => useCrmThread(conversation), { wrapper }), client };
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(telegramCrmApi, "listMessages").mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
  vi.spyOn(telegramCrmApi, "importHistory").mockResolvedValue({ conversationId: conversation.id, imported: 0, scanned: 0, nextBeforeTelegramMessageId: null, exhausted: true });
});

describe("CRM history reconciliation", () => {
  it("refreshes folder unread counts after a successful mark-read without waiting for SSE", async () => {
    const markRead = vi.spyOn(telegramCrmApi, "markConversationRead").mockResolvedValue({ conversationId: conversation.id, lastReadInboxTelegramMessageId: 99, readMessageCount: 2, unreadCount: 0 });
    const { client, result } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await act(async () => { await result.current.markRead.mutateAsync(99); });
    expect(markRead).toHaveBeenCalledWith(conversation.id, 99);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: telegramCrmKeys.inboxFolders(), exact: true, refetchType: "active" });
  });
  it("reconciles the latest page once on opening and repairs legacy exhausted state", async () => {
    vi.mocked(telegramCrmApi.importHistory).mockResolvedValue({ conversationId: conversation.id, imported: 0, scanned: 100, nextBeforeTelegramMessageId: 101, exhausted: false });
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.refreshRecent.isSuccess).toBe(true));
    expect(telegramCrmApi.importHistory).toHaveBeenCalledExactlyOnceWith(conversation.id, { recent: true, limit: 100 });
    expect(result.current.hasOlder).toBe(true);
    rerender();
    await act(async () => Promise.resolve());
    expect(telegramCrmApi.importHistory).toHaveBeenCalledTimes(1);
  });

  it("keeps cached messages visible after a failed reconciliation and allows explicit retry", async () => {
    vi.mocked(telegramCrmApi.listMessages).mockResolvedValue({ items: [sentMessage("Saved before disconnect", "saved")], nextCursor: null, hasMore: false });
    vi.mocked(telegramCrmApi.importHistory).mockRejectedValueOnce(new Error("Telegram unavailable"));
    const { result } = setup();
    await waitFor(() => expect(result.current.refreshRecent.isError).toBe(true));
    expect(result.current.messages.map((message) => message.text)).toEqual(["Saved before disconnect"]);
    await act(async () => { await result.current.refreshRecent.mutateAsync(); });
    expect(result.current.refreshRecent.isSuccess).toBe(true);
    expect(telegramCrmApi.importHistory).toHaveBeenCalledTimes(2);
  });

  it("shows an imported older page in one interaction and uses the repaired Telegram cursor", async () => {
    let importedOlder = false;
    const newest = sentMessage("Newest saved message", "newest");
    const older = { ...sentMessage("Previously missing older message", "older"), id: "older-message", sentAt: "2026-10-29T12:00:00.000Z" };
    vi.mocked(telegramCrmApi.listMessages).mockImplementation(async (_id, cursor) => cursor
      ? { items: [older], nextCursor: null, hasMore: false }
      : { items: [newest], nextCursor: importedOlder ? "older-page" : null, hasMore: importedOlder });
    vi.mocked(telegramCrmApi.importHistory).mockImplementation(async (_id, input) => {
      if (input.recent) return { conversationId: conversation.id, imported: 0, scanned: 100, nextBeforeTelegramMessageId: 101, exhausted: false };
      importedOlder = true;
      return { conversationId: conversation.id, imported: 1, scanned: 1, nextBeforeTelegramMessageId: null, exhausted: true };
    });
    const { result } = setup();
    await waitFor(() => expect(result.current.refreshRecent.isSuccess).toBe(true));
    expect(result.current.messages).toHaveLength(1);
    await act(async () => { await result.current.loadOlder(); });
    await waitFor(() => expect(result.current.messages.map((message) => message.text)).toEqual(["Previously missing older message", "Newest saved message"]));
    expect(telegramCrmApi.importHistory).toHaveBeenNthCalledWith(2, conversation.id, { limit: 51, beforeTelegramMessageId: 101 });
    expect(telegramCrmApi.listMessages).toHaveBeenLastCalledWith(conversation.id, "older-page", 50, expect.anything());
    expect(result.current.hasOlder).toBe(false);
  });
});

describe("useCrmThread send behavior", () => {
  it.each(["loading", "failed"] as const)("does not send or invent a history page when initial history is %s", async (state) => {
    if (state === "loading") vi.mocked(telegramCrmApi.listMessages).mockReturnValue(new Promise(() => undefined));
    else vi.mocked(telegramCrmApi.listMessages).mockRejectedValue(new Error("History access unavailable"));
    const send = vi.spyOn(telegramCrmApi, "sendManualMessage");
    const { result, client } = setup();
    if (state === "failed") await waitFor(() => expect(result.current.query.isError).toBe(true));
    else expect(result.current.query.isLoading).toBe(true);
    await act(async () => {
      expect(await result.current.sendText("Keep this draft until history loads", "unsent-key")).toBe(false);
    });
    expect(send).not.toHaveBeenCalled();
    expect(result.current.messages).toEqual([]);
    expect(client.getQueryData(telegramCrmKeys.messagesInfinite(conversation.id))).toBeUndefined();
    expect(telegramCrmApi.listMessages).toHaveBeenCalledOnce();
  });

  it("guards concurrent send attempts before React can disable the composer", async () => {
    let resolve!: (value: Awaited<ReturnType<typeof telegramCrmApi.sendManualMessage>>) => void;
    const send = vi.spyOn(telegramCrmApi, "sendManualMessage").mockImplementation(() => new Promise((done) => { resolve = done; }));
    const { result } = setup();
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    let first!: Promise<boolean>;
    await act(async () => {
      first = result.current.sendText("One customer message", "stable-key");
      expect(await result.current.sendText("One customer message", "stable-key")).toBe(false);
    });
    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].deliveryState).toBe("PENDING");
    await act(async () => {
      resolve({ message: sentMessage("One customer message", "stable-key"), idempotentReplay: false });
      expect(await first).toBe(true);
    });
    expect(send).toHaveBeenCalledOnce();
    expect(result.current.messages).toHaveLength(1);
    await waitFor(() => expect(result.current.messages[0]).toMatchObject({ id: "saved-message", deliveryState: "SENT" }));
  });

  it("keeps a definitively rejected optimistic message and reconciles an authorized retry with the same key", async () => {
    const send = vi.spyOn(telegramCrmApi, "sendManualMessage")
      .mockRejectedValueOnce({ response: {status: 403, data: {message: "CHAT_SEND_UNAVAILABLE"}} })
      .mockResolvedValueOnce({ message: sentMessage("Retry safely", "same-key"), idempotentReplay: true });
    const { result } = setup();
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    await act(async () => { expect(await result.current.sendText("Retry safely", "same-key")).toBe(false); });
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    await waitFor(() => expect(result.current.messages[0].deliveryState).toBe("FAILED"));
    await act(async () => { expect(await result.current.sendText("Retry safely", "same-key")).toBe(true); });
    expect(send.mock.calls.map((call) => call[1].clientIdempotencyKey)).toEqual(["same-key", "same-key"]);
    expect(result.current.messages).toHaveLength(1);
    await waitFor(() => expect(result.current.messages[0]).toMatchObject({ id: "saved-message", deliveryState: "SENT" }));
  });

  it("rejects empty and over-limit input before invoking the API", async () => {
    const send = vi.spyOn(telegramCrmApi, "sendManualMessage");
    const { result } = setup();
    await act(async () => {
      expect(await result.current.sendText("  ", "empty-key")).toBe(false);
      expect(await result.current.sendText("x".repeat(4097), "large-key")).toBe(false);
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("does not refetch message history after a known successful send", async () => {
    vi.spyOn(telegramCrmApi, "sendManualMessage").mockResolvedValue({ message: sentMessage("Known response", "message-key"), idempotentReplay: false });
    const { result, client } = setup();
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    await act(async () => { await result.current.sendText("Known response", "message-key"); });
    expect(telegramCrmApi.listMessages).toHaveBeenCalledOnce();
    expect(client.getQueryState(telegramCrmKeys.messagesInfinite(conversation.id))?.isInvalidated).toBe(false);
    await waitFor(() => expect(result.current.messages[0]?.text).toBe("Known response"));
  });
  it("preserves approved AI provenance and canonical identity in failed-message retries", async () => {
    const approval = { aiDraftId: 'draft-one', aiDraftRevision: 3 };
    const key = 'ai:draft-one:3';
    const send = vi.spyOn(telegramCrmApi, 'sendManualMessage').mockRejectedValueOnce({ response: {status: 403, data: {message: 'CHAT_SEND_UNAVAILABLE'}} }).mockResolvedValue({ message: { ...sentMessage('Approved message',key), contentMetadata: approval }, idempotentReplay: false });
    const { result } = setup();
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    await act(async () => { expect(await result.current.sendText('Approved message',key,approval)).toBe(false); });
    await waitFor(() => expect(result.current.messages[0]).toMatchObject({ deliveryState: 'FAILED', clientIdempotencyKey:key, contentMetadata:approval }));
    await act(async () => { expect(await result.current.sendText('Approved message',key,approval)).toBe(true); });
    expect(send).toHaveBeenNthCalledWith(2,conversation.id,{ text:'Approved message',clientIdempotencyKey:key,...approval });
    expect(result.current.messages).toHaveLength(1);
    await waitFor(() => expect(result.current.messages[0].contentMetadata).toEqual(approval));
  });

  it("keeps a network outcome unknown and checks the receipt without another send", async () => {
    const send = vi.spyOn(telegramCrmApi, "sendManualMessage").mockRejectedValue(new Error("Response lost after provider acceptance"));
    const check = vi.spyOn(telegramCrmApi, "getManualSendReceipt").mockResolvedValue({message: sentMessage("Uncertain send", "uncertain-key"), idempotentReplay: true});
    const {result} = setup();
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    await act(async () => { expect(await result.current.sendText("Uncertain send", "uncertain-key")).toBe(false); });
    await waitFor(() => expect(result.current.unknownSend).toBe(true));
    expect(result.current.messages[0].deliveryState).toBe("UNKNOWN");
    await act(async () => { expect(await result.current.sendText("Uncertain send", "uncertain-key")).toBe(false); });
    expect(send).toHaveBeenCalledOnce();
    await act(async () => { await result.current.checkSend.mutateAsync(); });
    expect(check).toHaveBeenCalledWith(conversation.id, "uncertain-key");
    await waitFor(() => expect(result.current.unknownSend).toBe(false));
    expect(result.current.messages[0].deliveryState).toBe("SENT");
    expect(send).toHaveBeenCalledOnce();
  });

  it("orders Telegram messages sent in the same second by Telegram message id", async () => {
    vi.mocked(telegramCrmApi.listMessages).mockResolvedValue({ items: [
      { ...sentMessage("Later", "later"), id: "a", telegramMessageIdNumeric: 22 },
      { ...sentMessage("Earlier", "earlier"), id: "z", telegramMessageIdNumeric: 21 },
    ], nextCursor: null, hasMore: false });
    const { result } = setup();
    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(result.current.messages.map((item) => item.text)).toEqual(["Earlier", "Later"]);
  });

});
