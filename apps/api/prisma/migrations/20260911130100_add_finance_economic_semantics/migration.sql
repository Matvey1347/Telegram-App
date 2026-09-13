CREATE TYPE "FinanceExpenseNecessity" AS ENUM (
  'UNSPECIFIED',
  'REQUIRED',
  'DISCRETIONARY'
);

ALTER TABLE "FinanceTransaction"
  ADD COLUMN "economicAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "economicAmountInValuationCurrency" DECIMAL(65,30),
  ADD COLUMN "necessity" "FinanceExpenseNecessity" NOT NULL DEFAULT 'UNSPECIFIED';

UPDATE "FinanceTransaction"
SET "economicAmount" = CASE
      WHEN "purpose" = 'ORDINARY' THEN "amount"
      ELSE 0
    END,
    "economicAmountInValuationCurrency" = CASE
      WHEN "purpose" = 'ORDINARY' THEN "amountInValuationCurrency"
      ELSE 0
    END;

ALTER TABLE "FinanceTransaction"
  ADD CONSTRAINT "FinanceTransaction_economic_amount_check" CHECK (
    "economicAmount" >= 0
    AND "economicAmount" <= "amount"
    AND (
      "purpose" = 'ORDINARY'
      OR "economicAmount" = 0
    )
  );

ALTER TABLE "FinanceTransaction"
  DROP CONSTRAINT IF EXISTS "FinanceTransaction_purpose_direction_check";

ALTER TABLE "FinanceTransaction"
  ADD CONSTRAINT "FinanceTransaction_purpose_direction_check" CHECK (
    "purpose" = 'ORDINARY'
    OR (
      "purpose" IN ('REIMBURSEMENT', 'PASS_THROUGH')
      AND "type" = 'INCOME'
      AND "categoryId" IS NULL
    )
    OR (
      "purpose" IN ('DEBT_REPAYMENT', 'INVESTMENT_CONTRIBUTION')
      AND "type" = 'EXPENSE'
      AND "categoryId" IS NULL
    )
    OR (
      "purpose" = 'INVESTMENT_RETURN'
      AND "type" = 'INCOME'
      AND "categoryId" IS NULL
    )
  );

ALTER TABLE "FinanceRecurringPayment"
  ADD COLUMN "necessity" "FinanceExpenseNecessity" NOT NULL DEFAULT 'UNSPECIFIED';

ALTER TABLE "FinanceRecurringPaymentRevision"
  ADD COLUMN "necessity" "FinanceExpenseNecessity" NOT NULL DEFAULT 'UNSPECIFIED';
