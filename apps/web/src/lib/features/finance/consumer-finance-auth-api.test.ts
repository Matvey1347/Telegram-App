import { describe, expect, it } from "vitest";
import { buildConsumerFinanceBrowserTransferUrl } from "./consumer-finance-auth-api";

describe("consumerFinanceAuthApi.browserTransferUrl", () => {
  it("creates an absolute production URL when the API is served at relative /api", () => {
    expect(
      buildConsumerFinanceBrowserTransferUrl("finance-bot", "a+b", "/api", {
        origin: "https://nexeloq.com",
      }),
    ).toBe(
      "https://nexeloq.com/api/finance-bots/finance-bot/auth/transfer?token=a%2Bb",
    );
  });
});
