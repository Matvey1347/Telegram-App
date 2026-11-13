import { consumerFinanceInvestmentsApi } from "@consumer-finance/web/lib/api/consumer-finance-investments-api";

export type InvestmentMovement = {
  id: string;
  mode: "deposit" | "return" | "valuation";
  amount: number;
  accountId: string;
  occurredAt: string;
  idempotencyKey: string;
};

export function recordInvestmentMovement(botId: string, input: InvestmentMovement) {
  if (input.mode === "valuation") {
    return consumerFinanceInvestmentsApi.addValuation(botId, input.id, {
      value: String(input.amount), valuedAt: input.occurredAt, idempotencyKey: input.idempotencyKey,
    });
  }
  return consumerFinanceInvestmentsApi.addCashFlow(botId, input.id, {
    kind: input.mode === "deposit" ? "CONTRIBUTION" : "RETURN",
    amount: String(input.amount), accountId: input.accountId,
    occurredAt: input.occurredAt, idempotencyKey: input.idempotencyKey,
  });
}
