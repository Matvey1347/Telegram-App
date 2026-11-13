import { describe, expect, it, vi } from "vitest";

const { addCashFlow, addValuation } = vi.hoisted(() => ({ addCashFlow: vi.fn(), addValuation: vi.fn() }));
vi.mock("@consumer-finance/web/lib/api/consumer-finance-investments-api", () => ({ consumerFinanceInvestmentsApi: { addCashFlow, addValuation } }));
import { recordInvestmentMovement, type InvestmentMovement } from "./groshly-investment-movement";

const input: InvestmentMovement = { id: "investment", mode: "deposit", amount: 25, accountId: "account", occurredAt: "2026-11-13T10:00:00.000Z", idempotencyKey: "stable-request" };

describe("investment movements", () => {
  it("sends the contribution and its idempotency key to the server", async () => {
    addCashFlow.mockResolvedValueOnce({ investment: { totalInvested: "125" } });
    await expect(recordInvestmentMovement("bot", input)).resolves.toMatchObject({ investment: { totalInvested: "125" } });
    expect(addCashFlow).toHaveBeenCalledWith("bot", "investment", { kind: "CONTRIBUTION", accountId: "account", amount: "25", occurredAt: input.occurredAt, idempotencyKey: input.idempotencyKey });
  });

  it("propagates a failed write and sends valuations separately", async () => {
    addCashFlow.mockRejectedValueOnce(new Error("unavailable"));
    await expect(recordInvestmentMovement("bot", { ...input, mode: "return" })).rejects.toThrow("unavailable");
    expect(addCashFlow).toHaveBeenLastCalledWith("bot", "investment", expect.objectContaining({ kind: "RETURN" }));
    addValuation.mockResolvedValueOnce({ investment: { currentValue: "0" } });
    await recordInvestmentMovement("bot", { ...input, mode: "valuation", amount: 0 });
    expect(addValuation).toHaveBeenCalledWith("bot", "investment", { value: "0", valuedAt: input.occurredAt, idempotencyKey: input.idempotencyKey });
  });
});
