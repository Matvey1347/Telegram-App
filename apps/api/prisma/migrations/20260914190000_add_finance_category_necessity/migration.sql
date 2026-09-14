ALTER TABLE "FinanceCategory"
ADD COLUMN IF NOT EXISTS "necessity" "FinanceExpenseNecessity" NOT NULL DEFAULT 'UNSPECIFIED';

ALTER TABLE "FinanceRecurringPayment"
ADD COLUMN IF NOT EXISTS "emoji" TEXT;
