CREATE TYPE "FinanceDebtDirection" AS ENUM ('I_OWE', 'OWED_TO_ME');
CREATE TYPE "FinanceDebtStatus" AS ENUM ('OPEN', 'SETTLED');
CREATE TYPE "FinanceRecurringPaymentRecurrence" AS ENUM ('WEEKLY', 'MONTHLY', 'YEARLY');
CREATE TYPE "FinanceRecurringPaymentStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELED');
CREATE TYPE "FinanceRecurringPaymentRevisionKind" AS ENUM ('CREATED', 'UPDATED', 'PAUSED', 'RESUMED', 'CANCELED', 'AMOUNT_APPLIED');

CREATE TABLE "FinanceDebt" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "direction" "FinanceDebtDirection" NOT NULL,
    "status" "FinanceDebtStatus" NOT NULL DEFAULT 'OPEN',
    "name" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "scheduleTimezone" TEXT NOT NULL,
    "note" TEXT,
    "settledAt" TIMESTAMP(3),
    "settlementTransactionId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FinanceDebt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceRecurringPayment" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "recurrence" "FinanceRecurringPaymentRecurrence" NOT NULL,
    "anchorDay" INTEGER NOT NULL,
    "anchorMonth" INTEGER,
    "nextOccurrenceAt" TIMESTAMP(3) NOT NULL,
    "scheduleTimezone" TEXT NOT NULL,
    "note" TEXT,
    "status" "FinanceRecurringPaymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FinanceRecurringPayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceRecurringPaymentRevision" (
    "id" TEXT NOT NULL,
    "recurringPaymentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" "FinanceRecurringPaymentRevisionKind" NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "categoryId" TEXT,
    "categoryName" TEXT,
    "categoryKey" TEXT,
    "recurrence" "FinanceRecurringPaymentRecurrence" NOT NULL,
    "anchorDay" INTEGER NOT NULL,
    "anchorMonth" INTEGER,
    "nextOccurrenceAt" TIMESTAMP(3) NOT NULL,
    "scheduleTimezone" TEXT NOT NULL,
    "note" TEXT,
    "status" "FinanceRecurringPaymentStatus" NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinanceRecurringPaymentRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceRecurringPaymentOccurrence" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "recurringPaymentId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "configVersion" INTEGER NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "scheduledAmount" DECIMAL(65,30) NOT NULL,
    "paidAmount" DECIMAL(65,30) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "futureAmountAppliedAt" TIMESTAMP(3),
    CONSTRAINT "FinanceRecurringPaymentOccurrence_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TelegramBotDelivery"
  ADD COLUMN "financeDebtId" TEXT,
  ADD COLUMN "financeRecurringPaymentId" TEXT;

CREATE UNIQUE INDEX "FinanceDebt_settlementTransactionId_key" ON "FinanceDebt"("settlementTransactionId");
CREATE INDEX "FinanceDebt_profileId_status_dueAt_id_idx" ON "FinanceDebt"("profileId", "status", "dueAt", "id");
CREATE INDEX "FinanceDebt_accountId_idx" ON "FinanceDebt"("accountId");
CREATE INDEX "FinanceRecurringPayment_profileId_status_nextOccurrenceAt_id_idx" ON "FinanceRecurringPayment"("profileId", "status", "nextOccurrenceAt", "id");
CREATE INDEX "FinanceRecurringPayment_accountId_idx" ON "FinanceRecurringPayment"("accountId");
CREATE INDEX "FinanceRecurringPayment_categoryId_idx" ON "FinanceRecurringPayment"("categoryId");
CREATE UNIQUE INDEX "FinanceRecurringPaymentRevision_recurringPaymentId_version_key" ON "FinanceRecurringPaymentRevision"("recurringPaymentId", "version");
CREATE INDEX "FinanceRecurringPaymentRevision_recurringPaymentId_effectiveAt_id_idx" ON "FinanceRecurringPaymentRevision"("recurringPaymentId", "effectiveAt", "id");
CREATE UNIQUE INDEX "FinanceRecurringPaymentOccurrence_transactionId_key" ON "FinanceRecurringPaymentOccurrence"("transactionId");
CREATE UNIQUE INDEX "FinanceRecurringPaymentOccurrence_recurringPaymentId_scheduledFor_key" ON "FinanceRecurringPaymentOccurrence"("recurringPaymentId", "scheduledFor");
CREATE INDEX "FinanceRecurringPaymentOccurrence_recurringPaymentId_confirmedAt_id_idx" ON "FinanceRecurringPaymentOccurrence"("recurringPaymentId", "confirmedAt", "id");
CREATE INDEX "FinanceRecurringPaymentOccurrence_profileId_confirmedAt_id_idx" ON "FinanceRecurringPaymentOccurrence"("profileId", "confirmedAt", "id");
CREATE INDEX "TelegramBotDelivery_financeDebtId_idx" ON "TelegramBotDelivery"("financeDebtId");
CREATE INDEX "TelegramBotDelivery_financeRecurringPaymentId_idx" ON "TelegramBotDelivery"("financeRecurringPaymentId");

ALTER TABLE "FinanceDebt" ADD CONSTRAINT "FinanceDebt_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "FinanceProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceDebt" ADD CONSTRAINT "FinanceDebt_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceDebt" ADD CONSTRAINT "FinanceDebt_settlementTransactionId_fkey" FOREIGN KEY ("settlementTransactionId") REFERENCES "FinanceTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceRecurringPayment" ADD CONSTRAINT "FinanceRecurringPayment_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "FinanceProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceRecurringPayment" ADD CONSTRAINT "FinanceRecurringPayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceRecurringPayment" ADD CONSTRAINT "FinanceRecurringPayment_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinanceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinanceRecurringPaymentRevision" ADD CONSTRAINT "FinanceRecurringPaymentRevision_recurringPaymentId_fkey" FOREIGN KEY ("recurringPaymentId") REFERENCES "FinanceRecurringPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceRecurringPaymentOccurrence" ADD CONSTRAINT "FinanceRecurringPaymentOccurrence_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "FinanceProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceRecurringPaymentOccurrence" ADD CONSTRAINT "FinanceRecurringPaymentOccurrence_recurringPaymentId_fkey" FOREIGN KEY ("recurringPaymentId") REFERENCES "FinanceRecurringPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceRecurringPaymentOccurrence" ADD CONSTRAINT "FinanceRecurringPaymentOccurrence_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "FinanceTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TelegramBotDelivery" DROP CONSTRAINT "TelegramBotDelivery_financeReminderId_fkey";
ALTER TABLE "TelegramBotDelivery" ADD CONSTRAINT "TelegramBotDelivery_financeReminderId_fkey" FOREIGN KEY ("financeReminderId") REFERENCES "FinanceReminder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramBotDelivery" ADD CONSTRAINT "TelegramBotDelivery_financeDebtId_fkey" FOREIGN KEY ("financeDebtId") REFERENCES "FinanceDebt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramBotDelivery" ADD CONSTRAINT "TelegramBotDelivery_financeRecurringPaymentId_fkey" FOREIGN KEY ("financeRecurringPaymentId") REFERENCES "FinanceRecurringPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
