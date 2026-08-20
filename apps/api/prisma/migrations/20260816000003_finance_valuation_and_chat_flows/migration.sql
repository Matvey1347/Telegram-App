-- Transaction valuations are immutable USD snapshots. Existing rows remain
-- explicitly unvalued: amountInDefaultCurrency/exchangeRateToDefault record
-- the default currency at the original write, but the old schema did not save
-- which default it was. Backfilling USD here would silently misstate rows when
-- a profile changed its default currency before this one-time migration.
ALTER TABLE "FinanceTransaction"
  ADD COLUMN "valuationCurrency" VARCHAR(3),
  ADD COLUMN "amountInValuationCurrency" DECIMAL,
  ADD COLUMN "exchangeRateToValuation" DECIMAL,
  ADD COLUMN "valuationRateAt" TIMESTAMP(3);

CREATE TABLE "FinanceChatFlow" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "botIntegrationId" TEXT NOT NULL,
  "telegramBotUserId" TEXT NOT NULL,
  "step" VARCHAR(80) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  "payload" JSONB NOT NULL DEFAULT '{}',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceChatFlow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceChatFlow_botIntegrationId_telegramBotUserId_key"
  ON "FinanceChatFlow"("botIntegrationId", "telegramBotUserId");
CREATE INDEX "FinanceChatFlow_profileId_expiresAt_idx"
  ON "FinanceChatFlow"("profileId", "expiresAt");
CREATE INDEX "FinanceChatFlow_expiresAt_idx" ON "FinanceChatFlow"("expiresAt");
ALTER TABLE "FinanceChatFlow" ADD CONSTRAINT "FinanceChatFlow_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "FinanceProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
