import { afterEach, describe, expect, it, vi } from "vitest";
import { financeBillingApi } from "./finance-billing-api";

afterEach(() => vi.unstubAllGlobals());

describe("Finance billing browser session", () => {
  it("posts Telegram proof to Finance using first-party cookies and never sends it to billing reads", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ authenticated: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ tier: "FREE", offers: [], history: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await financeBillingApi.establishTelegramSession("finance-bot", "signed-proof");
    await financeBillingApi.get("finance-bot");

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/finance/session/telegram-browser", expect.objectContaining({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ financeBotId: "finance-bot", initData: "signed-proof" }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/finance/finance-bot/billing", expect.objectContaining({ credentials: "include" }));
    expect(JSON.stringify(fetchMock.mock.calls[1])).not.toContain("signed-proof");
  });
});
