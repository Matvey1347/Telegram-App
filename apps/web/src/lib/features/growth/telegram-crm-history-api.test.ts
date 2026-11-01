import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { telegramCrmApi } from "./telegram-crm-api";

vi.mock("@/lib/api", () => ({ api: { post: vi.fn() } }));
beforeEach(() => vi.clearAllMocks());
describe("CRM history synchronization feedback", () => {
  it("returns the imported page with feedback owned by the thread", async () => {
    const result = { imported: 2, scanned: 50, exhausted: false };
    vi.mocked(api.post).mockResolvedValue({ data: result });
    await expect(telegramCrmApi.importHistory("thread-a", { recent: true, limit: 100 })).resolves.toEqual(result);
    expect(api.post).toHaveBeenCalledWith("/telegram-crm/conversations/thread-a/history", { recent: true, limit: 100 }, { feedback: { mode: "managed" } });
  });
  it("preserves sync failures for the thread retry state", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("Offline"));
    await expect(telegramCrmApi.importHistory("thread-b", { beforeTelegramMessageId: 20 })).rejects.toThrow("Offline");
  });
});
