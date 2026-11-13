-- An assessment is a snapshot at its date; later cash movements change the
-- current value. Rebuild existing projections without changing the ledger.
WITH projection AS (
  SELECT i.id,
    COALESCE(v.value, 0) + COALESCE(m.base_delta, 0) AS current_value,
    COALESCE(v."amountInValuationCurrency", 0) + COALESCE(m.usd_delta, 0) AS current_usd,
    v."valuedAt" AS valued_at
  FROM "FinanceInvestment" i
  LEFT JOIN LATERAL (
    SELECT v.* FROM "FinanceInvestmentValuation" v
    WHERE v."investmentId" = i.id AND v."profileId" = i."profileId"
      AND NOT EXISTS (SELECT 1 FROM "FinanceInvestmentValuation" correction WHERE correction."correctsValuationId" = v.id)
    ORDER BY v."valuedAt" DESC, v."createdAt" DESC, v.id DESC LIMIT 1
  ) v ON true
  LEFT JOIN LATERAL (
    SELECT SUM(CASE WHEN f.kind = 'CONTRIBUTION' THEN f."amountInInvestmentCurrency" ELSE -f."amountInInvestmentCurrency" END) AS base_delta,
      SUM(CASE WHEN f.kind = 'CONTRIBUTION' THEN COALESCE(t."amountInValuationCurrency", 0) ELSE -COALESCE(t."amountInValuationCurrency", 0) END) AS usd_delta
    FROM "FinanceInvestmentCashFlow" f
    JOIN "FinanceTransaction" t ON t.id = f."transactionId" AND t."deletedAt" IS NULL
    WHERE f."investmentId" = i.id AND f."profileId" = i."profileId"
      AND (v.id IS NULL OR f."occurredAt" > v."valuedAt" OR (f."occurredAt" = v."valuedAt" AND f."createdAt" > v."createdAt"))
  ) m ON true
)
UPDATE "FinanceInvestment" i SET "currentValue" = p.current_value,
  "currentValueInValuationCurrency" = p.current_usd, "currentValuationAt" = p.valued_at,
  version = i.version + 1
FROM projection p WHERE i.id = p.id AND
  (i."currentValue" IS DISTINCT FROM p.current_value OR i."currentValueInValuationCurrency" IS DISTINCT FROM p.current_usd OR i."currentValuationAt" IS DISTINCT FROM p.valued_at);
