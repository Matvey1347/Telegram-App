-- CreateEnum
CREATE TYPE "FinanceBillingMode" AS ENUM ('TEST', 'LIVE');

-- CreateEnum
CREATE TYPE "FinanceBillingOffer" AS ENUM ('INTRO', 'MONTH', 'QUARTER', 'YEAR');

-- CreateEnum
CREATE TYPE "FinanceBillingStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED', 'GIFT');

-- CreateTable
CREATE TABLE "FinanceBillingPrice" (
    "id" TEXT NOT NULL,
    "mode" "FinanceBillingMode" NOT NULL,
    "offer" "FinanceBillingOffer" NOT NULL,
    "version" INTEGER NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UAH',
    "stripeProductId" TEXT,
    "stripePriceId" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceBillingPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceBillingSubscription" (
    "id" TEXT NOT NULL,
    "financeBotId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "mode" "FinanceBillingMode" NOT NULL,
    "offer" "FinanceBillingOffer",
    "status" "FinanceBillingStatus" NOT NULL DEFAULT 'PENDING',
    "priceId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'STRIPE',
    "legacySourceId" TEXT,
    "stripeCustomerId" TEXT,
    "stripeCheckoutId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripeScheduleId" TEXT,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "introUsed" BOOLEAN NOT NULL DEFAULT false,
    "checkoutExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceBillingSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceBillingPayment" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "mode" "FinanceBillingMode" NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "stripeInvoiceId" TEXT,
    "stripePaymentIntentId" TEXT,
    "stripeChargeId" TEXT,
    "stripeRefundId" TEXT,
    "stripeDisputeId" TEXT,
    "kind" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "internalBonusMinor" INTEGER NOT NULL DEFAULT 0,
    "confirmedCashMinor" INTEGER NOT NULL DEFAULT 0,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceBillingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceBillingWebhookEvent" (
    "id" TEXT NOT NULL,
    "mode" "FinanceBillingMode" NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceBillingWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinanceBillingPrice_mode_offer_isCurrent_idx" ON "FinanceBillingPrice"("mode", "offer", "isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBillingPrice_mode_offer_version_key" ON "FinanceBillingPrice"("mode", "offer", "version");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBillingPrice_mode_stripePriceId_key" ON "FinanceBillingPrice"("mode", "stripePriceId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBillingSubscription_legacySourceId_key" ON "FinanceBillingSubscription"("legacySourceId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBillingSubscription_stripeCheckoutId_key" ON "FinanceBillingSubscription"("stripeCheckoutId");

-- CreateIndex
CREATE INDEX "FinanceBillingSubscription_profileId_mode_status_currentPer_idx" ON "FinanceBillingSubscription"("profileId", "mode", "status", "currentPeriodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBillingSubscription_mode_stripeSubscriptionId_key" ON "FinanceBillingSubscription"("mode", "stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "FinanceBillingPayment_profileId_occurredAt_idx" ON "FinanceBillingPayment"("profileId", "occurredAt");

-- CreateIndex
CREATE INDEX "FinanceBillingPayment_mode_stripeInvoiceId_idx" ON "FinanceBillingPayment"("mode", "stripeInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBillingPayment_mode_stripeEventId_key" ON "FinanceBillingPayment"("mode", "stripeEventId");

CREATE UNIQUE INDEX "FinanceBillingPayment_mode_stripeRefundId_key" ON "FinanceBillingPayment"("mode", "stripeRefundId");

CREATE UNIQUE INDEX "FinanceBillingPayment_mode_stripeInvoiceId_kind_key" ON "FinanceBillingPayment"("mode", "stripeInvoiceId", "kind");

CREATE UNIQUE INDEX "FinanceBillingPayment_mode_stripeDisputeId_key" ON "FinanceBillingPayment"("mode", "stripeDisputeId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBillingWebhookEvent_mode_stripeEventId_key" ON "FinanceBillingWebhookEvent"("mode", "stripeEventId");

-- AddForeignKey
ALTER TABLE "FinanceBillingSubscription" ADD CONSTRAINT "FinanceBillingSubscription_financeBotId_fkey" FOREIGN KEY ("financeBotId") REFERENCES "FinanceBot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBillingSubscription" ADD CONSTRAINT "FinanceBillingSubscription_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "FinanceProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBillingSubscription" ADD CONSTRAINT "FinanceBillingSubscription_priceId_fkey" FOREIGN KEY ("priceId") REFERENCES "FinanceBillingPrice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBillingPayment" ADD CONSTRAINT "FinanceBillingPayment_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "FinanceProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBillingPayment" ADD CONSTRAINT "FinanceBillingPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "FinanceBillingSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

