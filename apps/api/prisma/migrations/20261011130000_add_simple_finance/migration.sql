ALTER TYPE "TelegramBotApplicationType" ADD VALUE IF NOT EXISTS 'SIMPLE_FINANCE';

CREATE TYPE "SimpleFinanceCategoryType" AS ENUM ('INCOME', 'EXPENSE');
CREATE TYPE "SimpleFinanceEntryKind" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER');

CREATE TABLE "SimpleFinanceProfile" (
  "id" TEXT NOT NULL,
  "botIntegrationId" TEXT NOT NULL,
  "telegramBotUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SimpleFinanceProfile_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SimpleFinanceAccount" (
  "id" TEXT NOT NULL, "profileId" TEXT NOT NULL, "name" VARCHAR(80) NOT NULL,
  "emoji" VARCHAR(32) NOT NULL DEFAULT '💳', "initialBalanceMinor" DECIMAL(18,0) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SimpleFinanceAccount_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SimpleFinanceCategory" (
  "id" TEXT NOT NULL, "profileId" TEXT NOT NULL, "name" VARCHAR(80) NOT NULL,
  "emoji" VARCHAR(32) NOT NULL DEFAULT '🏷️', "type" "SimpleFinanceCategoryType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SimpleFinanceCategory_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SimpleFinanceEntry" (
  "id" TEXT NOT NULL, "profileId" TEXT NOT NULL, "kind" "SimpleFinanceEntryKind" NOT NULL,
  "amountMinor" DECIMAL(18,0) NOT NULL, "accountId" TEXT, "categoryId" TEXT,
  "fromAccountId" TEXT, "toAccountId" TEXT, "name" VARCHAR(120), "emoji" VARCHAR(32),
  "comment" VARCHAR(500), "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SimpleFinanceEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SimpleFinanceProfile_botIntegrationId_telegramBotUserId_key" ON "SimpleFinanceProfile"("botIntegrationId", "telegramBotUserId");
CREATE INDEX "SimpleFinanceProfile_telegramBotUserId_idx" ON "SimpleFinanceProfile"("telegramBotUserId");
CREATE INDEX "SimpleFinanceAccount_profileId_createdAt_idx" ON "SimpleFinanceAccount"("profileId", "createdAt");
CREATE INDEX "SimpleFinanceCategory_profileId_type_createdAt_idx" ON "SimpleFinanceCategory"("profileId", "type", "createdAt");
CREATE INDEX "SimpleFinanceEntry_profileId_occurredAt_id_idx" ON "SimpleFinanceEntry"("profileId", "occurredAt", "id");
CREATE INDEX "SimpleFinanceEntry_profileId_kind_occurredAt_idx" ON "SimpleFinanceEntry"("profileId", "kind", "occurredAt");
CREATE INDEX "SimpleFinanceEntry_profileId_accountId_occurredAt_idx" ON "SimpleFinanceEntry"("profileId", "accountId", "occurredAt");
ALTER TABLE "SimpleFinanceProfile" ADD CONSTRAINT "SimpleFinanceProfile_botIntegrationId_fkey" FOREIGN KEY ("botIntegrationId") REFERENCES "TelegramBotIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SimpleFinanceProfile" ADD CONSTRAINT "SimpleFinanceProfile_telegramBotUserId_fkey" FOREIGN KEY ("telegramBotUserId") REFERENCES "TelegramBotUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SimpleFinanceAccount" ADD CONSTRAINT "SimpleFinanceAccount_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "SimpleFinanceProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SimpleFinanceCategory" ADD CONSTRAINT "SimpleFinanceCategory_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "SimpleFinanceProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SimpleFinanceEntry" ADD CONSTRAINT "SimpleFinanceEntry_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "SimpleFinanceProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SimpleFinanceEntry" ADD CONSTRAINT "SimpleFinanceEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SimpleFinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SimpleFinanceEntry" ADD CONSTRAINT "SimpleFinanceEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "SimpleFinanceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SimpleFinanceEntry" ADD CONSTRAINT "SimpleFinanceEntry_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "SimpleFinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SimpleFinanceEntry" ADD CONSTRAINT "SimpleFinanceEntry_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "SimpleFinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
