import { beforeEach, describe, expect, it, vi } from "vitest";
import { listCrmInboxConversations } from "@/lib/features/growth/crm-inbox-api";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import { markAllCrmUnread } from "./crm-unread-mark-all";
vi.mock("@/lib/features/growth/crm-inbox-api", () => ({ listCrmInboxConversations: vi.fn() }));
vi.mock("@/lib/features/growth/telegram-crm-api", () => ({ telegramCrmApi: { importHistory: vi.fn(), listMessages: vi.fn(), markConversationRead: vi.fn() } }));
beforeEach(() => vi.resetAllMocks());
describe("mark all unread", () => {
  it("collects every page before processing and marks up to the refreshed watermark", async () => {
    vi.mocked(listCrmInboxConversations).mockResolvedValueOnce({ items: [{ id: "one" }] as never, hasMore: true, nextCursor: "next" }).mockResolvedValueOnce({ items: [{ id: "two" }] as never, hasMore: false, nextCursor: null });
    vi.mocked(telegramCrmApi.importHistory).mockResolvedValue({} as never);
    vi.mocked(telegramCrmApi.listMessages).mockResolvedValue({ items: [{ telegramMessageIdNumeric: 12 }] } as never);
    const result = await markAllCrmUnread(vi.fn());
    expect(result).toEqual({ total: 2, failed: 0 });
    expect(telegramCrmApi.markConversationRead).toHaveBeenCalledWith("two", 12, undefined);
    expect(vi.mocked(listCrmInboxConversations).mock.invocationCallOrder[1]).toBeLessThan(vi.mocked(telegramCrmApi.markConversationRead).mock.invocationCallOrder[0]);
  });
  it("reports individual failures and continues without marking an unrefreshed conversation", async () => {
    vi.mocked(listCrmInboxConversations).mockResolvedValue({ items: [{ id: "one" }, { id: "two" }] as never, hasMore: false, nextCursor: null });
    vi.mocked(telegramCrmApi.importHistory).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({} as never);
    vi.mocked(telegramCrmApi.listMessages).mockResolvedValue({ items: [{ telegramMessageIdNumeric: 23 }] } as never);
    expect(await markAllCrmUnread(vi.fn())).toEqual({ total: 2, failed: 1 });
    expect(telegramCrmApi.markConversationRead).toHaveBeenCalledTimes(1);
    expect(telegramCrmApi.markConversationRead).toHaveBeenCalledWith("two", 23, undefined);
  });
  it("stops before marking or moving to another chat when cancelled during refresh", async () => {
    const controller = new AbortController();
    vi.mocked(listCrmInboxConversations).mockResolvedValue({ items: [{ id: "one" }, { id: "two" }] as never, hasMore: false, nextCursor: null });
    vi.mocked(telegramCrmApi.importHistory).mockImplementation(async () => { controller.abort(); return {} as never; });
    await expect(markAllCrmUnread(vi.fn(), controller.signal)).rejects.toThrow();
    expect(telegramCrmApi.importHistory).toHaveBeenCalledTimes(1);
    expect(telegramCrmApi.listMessages).not.toHaveBeenCalled();
    expect(telegramCrmApi.markConversationRead).not.toHaveBeenCalled();
  });
  it("does not mark anything if unread pagination fails", async () => {
    vi.mocked(listCrmInboxConversations).mockResolvedValue({ items: [{ id: "one" }] as never, hasMore: true, nextCursor: null });
    await expect(markAllCrmUnread(vi.fn())).rejects.toThrow();
    expect(telegramCrmApi.markConversationRead).not.toHaveBeenCalled();
  });
});
