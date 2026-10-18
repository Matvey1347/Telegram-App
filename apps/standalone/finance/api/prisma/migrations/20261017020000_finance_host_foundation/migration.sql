-- Finance API owns this schema from its first migration. This migration is
-- intentionally additive: it neither reads nor modifies Nexeloq tables.
CREATE TYPE "FinanceWebhookUpdateStatus" AS ENUM ('RECEIVED', 'ACCEPTED', 'FAILED');
CREATE TYPE "FinanceTransactionKind" AS ENUM ('INCOME', 'EXPENSE');

CREATE TABLE "FinanceBot" (
  "id" TEXT NOT NULL,
  "legacyBotIntegrationId" TEXT,
  "telegramBotId" TEXT,
  "webhookEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceBot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceTelegramUser" (
  "id" TEXT NOT NULL,
  "financeBotId" TEXT NOT NULL,
  "telegramUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceTelegramUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceWebhookUpdate" (
  "id" TEXT NOT NULL,
  "financeBotId" TEXT NOT NULL,
  "updateId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "FinanceWebhookUpdateStatus" NOT NULL DEFAULT 'RECEIVED',
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceWebhookUpdate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceProfile" (
  "id" TEXT NOT NULL,
  "financeBotId" TEXT NOT NULL,
  "financeTelegramUserId" TEXT NOT NULL,
  "defaultCurrency" TEXT NOT NULL DEFAULT 'USD',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceAccount" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "balanceMinor" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceTransaction" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "kind" "FinanceTransactionKind" NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "economicAmountMinor" BIGINT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceBot_legacyBotIntegrationId_key" ON "FinanceBot"("legacyBotIntegrationId");
CREATE UNIQUE INDEX "FinanceBot_telegramBotId_key" ON "FinanceBot"("telegramBotId");
CREATE UNIQUE INDEX "FinanceTelegramUser_financeBotId_telegramUserId_key" ON "FinanceTelegramUser"("financeBotId", "telegramUserId");
CREATE INDEX "FinanceTelegramUser_telegramUserId_idx" ON "FinanceTelegramUser"("telegramUserId");
CREATE UNIQUE INDEX "FinanceWebhookUpdate_financeBotId_updateId_key" ON "FinanceWebhookUpdate"("financeBotId", "updateId");
CREATE INDEX "FinanceWebhookUpdate_status_receivedAt_idx" ON "FinanceWebhookUpdate"("status", "receivedAt");
CREATE UNIQUE INDEX "FinanceProfile_financeTelegramUserId_key" ON "FinanceProfile"("financeTelegramUserId");
CREATE UNIQUE INDEX "FinanceProfile_id_financeBotId_key" ON "FinanceProfile"("id", "financeBotId");
CREATE INDEX "FinanceProfile_financeBotId_idx" ON "FinanceProfile"("financeBotId");
CREATE INDEX "FinanceAccount_profileId_idx" ON "FinanceAccount"("profileId");
CREATE INDEX "FinanceTransaction_profileId_occurredAt_idx" ON "FinanceTransaction"("profileId", "occurredAt");
CREATE INDEX "FinanceTransaction_accountId_occurredAt_idx" ON "FinanceTransaction"("accountId", "occurredAt");

ALTER TABLE "FinanceTelegramUser" ADD CONSTRAINT "FinanceTelegramUser_financeBotId_fkey" FOREIGN KEY ("financeBotId") REFERENCES "FinanceBot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceWebhookUpdate" ADD CONSTRAINT "FinanceWebhookUpdate_financeBotId_fkey" FOREIGN KEY ("financeBotId") REFERENCES "FinanceBot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceProfile" ADD CONSTRAINT "FinanceProfile_financeBotId_fkey" FOREIGN KEY ("financeBotId") REFERENCES "FinanceBot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceProfile" ADD CONSTRAINT "FinanceProfile_financeTelegramUserId_fkey" FOREIGN KEY ("financeTelegramUserId") REFERENCES "FinanceTelegramUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceAccount" ADD CONSTRAINT "FinanceAccount_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "FinanceProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceTransaction" ADD CONSTRAINT "FinanceTransaction_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "FinanceProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceTransaction" ADD CONSTRAINT "FinanceTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
