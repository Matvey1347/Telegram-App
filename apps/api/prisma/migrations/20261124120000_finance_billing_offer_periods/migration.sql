ALTER TYPE "BotBillingInterval" ADD VALUE IF NOT EXISTS 'DAY';

ALTER TABLE "BotPlanPrice"
ADD COLUMN "intervalCount" INTEGER NOT NULL DEFAULT 1;

DROP INDEX IF EXISTS "BotPlanPrice_planId_currency_interval_version_key";
CREATE UNIQUE INDEX "BotPlanPrice_planId_currency_interval_intervalCount_version_key"
ON "BotPlanPrice"("planId", "currency", "interval", "intervalCount", "version");

DROP INDEX IF EXISTS "BotPlanPrice_planId_currency_interval_isPublic_isActive_idx";
CREATE INDEX "BotPlanPrice_planId_currency_interval_intervalCount_isPublic_isActive_idx"
ON "BotPlanPrice"("planId", "currency", "interval", "intervalCount", "isPublic", "isActive");

ALTER TABLE "BotSubscription"
ADD COLUMN "intervalCount" INTEGER,
ADD COLUMN "introPaidAt" TIMESTAMP(3),
ADD COLUMN "checkoutExpiresAt" TIMESTAMP(3),
ADD COLUMN "confirmedPaidThrough" TIMESTAMP(3);
