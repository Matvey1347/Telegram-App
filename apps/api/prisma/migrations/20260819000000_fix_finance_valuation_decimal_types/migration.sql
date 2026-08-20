-- Prisma Decimal defaults to DECIMAL(65,30). The original valuation migration
-- used an unconstrained DECIMAL, which left the live schema permanently
-- different from schema.prisma even after all migrations were applied.
ALTER TABLE "FinanceTransaction"
  ALTER COLUMN "amountInValuationCurrency"
    TYPE DECIMAL(65,30)
    USING "amountInValuationCurrency"::DECIMAL(65,30),
  ALTER COLUMN "exchangeRateToValuation"
    TYPE DECIMAL(65,30)
    USING "exchangeRateToValuation"::DECIMAL(65,30);
