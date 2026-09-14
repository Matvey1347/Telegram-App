ALTER TYPE "FinanceRecurringPaymentRecurrence" ADD VALUE IF NOT EXISTS 'DAILY';

ALTER TABLE "FinanceRecurringPayment"
ADD COLUMN "intervalCount" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "FinanceRecurringPaymentRevision"
ADD COLUMN "intervalCount" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "FinanceRecurringPayment"
ADD CONSTRAINT "FinanceRecurringPayment_intervalCount_check"
CHECK ("intervalCount" BETWEEN 1 AND 3650);

ALTER TABLE "FinanceRecurringPaymentRevision"
ADD CONSTRAINT "FinanceRecurringPaymentRevision_intervalCount_check"
CHECK ("intervalCount" BETWEEN 1 AND 3650);
