CREATE TYPE "FinanceTransactionPurpose" AS ENUM (
  'ORDINARY',
  'INVESTMENT_CONTRIBUTION',
  'INVESTMENT_RETURN'
);

CREATE TYPE "FinanceSavingsGoalStatus" AS ENUM (
  'ACTIVE',
  'COMPLETED',
  'ARCHIVED'
);

CREATE TYPE "FinanceSavingsMovementKind" AS ENUM (
  'ALLOCATE',
  'RELEASE',
  'REALLOCATE'
);

CREATE TYPE "FinanceInvestmentType" AS ENUM (
  'BUSINESS',
  'REAL_ESTATE',
  'SECURITIES',
  'CRYPTO',
  'DIGITAL_ASSET',
  'PHYSICAL_ASSET',
  'OTHER'
);

CREATE TYPE "FinanceInvestmentStatus" AS ENUM (
  'ACTIVE',
  'CLOSED',
  'ARCHIVED'
);

CREATE TYPE "FinanceInvestmentCashFlowKind" AS ENUM (
  'CONTRIBUTION',
  'RETURN'
);

ALTER TABLE "FinanceTransaction"
  ADD COLUMN "purpose" "FinanceTransactionPurpose" NOT NULL DEFAULT 'ORDINARY';

ALTER TABLE "FinanceTransaction"
  ADD CONSTRAINT "FinanceTransaction_purpose_direction_check" CHECK (
    "purpose" = 'ORDINARY'
    OR (
      "purpose" = 'INVESTMENT_CONTRIBUTION'
      AND "type" = 'EXPENSE'
      AND "categoryId" IS NULL
    )
    OR (
      "purpose" = 'INVESTMENT_RETURN'
      AND "type" = 'INCOME'
      AND "categoryId" IS NULL
    )
  );

CREATE INDEX "FinanceTransaction_profileId_purpose_occurredAt_idx"
  ON "FinanceTransaction"("profileId", "purpose", "occurredAt");

DROP INDEX IF EXISTS "FinanceGoal_profileId_active_idx";

ALTER TABLE "FinanceGoal"
  RENAME COLUMN "currentAmount" TO "legacyUnlinkedAmount";

ALTER TABLE "FinanceGoal"
  ADD COLUMN "note" TEXT,
  ADD COLUMN "status" "FinanceSavingsGoalStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "currentAllocated" DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "linkedAllocated" DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

UPDATE "FinanceGoal"
SET "currentAllocated" = "legacyUnlinkedAmount",
    "status" = CASE
      WHEN "active" THEN 'ACTIVE'::"FinanceSavingsGoalStatus"
      ELSE 'ARCHIVED'::"FinanceSavingsGoalStatus"
    END,
    "archivedAt" = CASE WHEN "active" THEN NULL ELSE "updatedAt" END;

ALTER TABLE "FinanceGoal" DROP COLUMN "active";

ALTER TABLE "FinanceGoal"
  ADD CONSTRAINT "FinanceGoal_amounts_check"
  CHECK (
    "targetAmount" > 0
    AND "currentAllocated" >= 0
    AND "linkedAllocated" >= 0
    AND "legacyUnlinkedAmount" >= 0
    AND "currentAllocated" = "linkedAllocated" + "legacyUnlinkedAmount"
  );

CREATE INDEX "FinanceGoal_profileId_status_updatedAt_id_idx"
  ON "FinanceGoal"("profileId", "status", "updatedAt", "id");

CREATE TABLE "FinanceSavingsMovement" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "fromGoalId" TEXT,
  "toGoalId" TEXT,
  "kind" "FinanceSavingsMovementKind" NOT NULL,
  "amount" DECIMAL(65,30) NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "valuationCurrency" VARCHAR(3) NOT NULL DEFAULT 'USD',
  "amountInValuationCurrency" DECIMAL(65,30) NOT NULL,
  "exchangeRateToValuation" DECIMAL(65,30) NOT NULL,
  "valuationRateAt" TIMESTAMP(3) NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "note" TEXT,
  "linkedTransferId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceSavingsMovement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceSavingsMovement_shape_check" CHECK (
    "amount" > 0 AND "amountInValuationCurrency" > 0
    AND "exchangeRateToValuation" > 0 AND (
      ("kind" = 'ALLOCATE' AND "fromGoalId" IS NULL AND "toGoalId" IS NOT NULL)
      OR ("kind" = 'RELEASE' AND "fromGoalId" IS NOT NULL AND "toGoalId" IS NULL)
      OR ("kind" = 'REALLOCATE' AND "fromGoalId" IS NOT NULL
          AND "toGoalId" IS NOT NULL AND "fromGoalId" <> "toGoalId")
    )
  )
);

CREATE UNIQUE INDEX "FinanceSavingsMovement_profileId_idempotencyKey_key"
  ON "FinanceSavingsMovement"("profileId", "idempotencyKey");
CREATE UNIQUE INDEX "FinanceSavingsMovement_linkedTransferId_key"
  ON "FinanceSavingsMovement"("linkedTransferId");
CREATE INDEX "FinanceSavingsMovement_profileId_occurredAt_id_idx"
  ON "FinanceSavingsMovement"("profileId", "occurredAt", "id");
CREATE INDEX "FinanceSavingsMovement_accountId_idx"
  ON "FinanceSavingsMovement"("accountId");
CREATE INDEX "FinanceSavingsMovement_fromGoalId_occurredAt_id_idx"
  ON "FinanceSavingsMovement"("fromGoalId", "occurredAt", "id");
CREATE INDEX "FinanceSavingsMovement_toGoalId_occurredAt_id_idx"
  ON "FinanceSavingsMovement"("toGoalId", "occurredAt", "id");

ALTER TABLE "FinanceSavingsMovement"
  ADD CONSTRAINT "FinanceSavingsMovement_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "FinanceProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceSavingsMovement_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceSavingsMovement_fromGoalId_fkey"
  FOREIGN KEY ("fromGoalId") REFERENCES "FinanceGoal"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceSavingsMovement_toGoalId_fkey"
  FOREIGN KEY ("toGoalId") REFERENCES "FinanceGoal"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceSavingsMovement_linkedTransferId_fkey"
  FOREIGN KEY ("linkedTransferId") REFERENCES "FinanceTransfer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "FinanceInvestment" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "type" "FinanceInvestmentType" NOT NULL DEFAULT 'OTHER',
  "currency" VARCHAR(3) NOT NULL,
  "status" "FinanceInvestmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "startedAt" TIMESTAMP(3) NOT NULL,
  "closedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "totalInvested" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "totalReturned" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "totalInvestedInValuationCurrency" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "totalReturnedInValuationCurrency" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "currentValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "currentValueInValuationCurrency" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "valuationCurrency" VARCHAR(3) NOT NULL DEFAULT 'USD',
  "currentValuationAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceInvestment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceInvestment_amounts_check" CHECK (
    "totalInvested" >= 0 AND "totalReturned" >= 0
    AND "totalInvestedInValuationCurrency" >= 0
    AND "totalReturnedInValuationCurrency" >= 0
    AND "currentValue" >= 0
    AND "currentValueInValuationCurrency" >= 0
  )
);

CREATE INDEX "FinanceInvestment_profileId_status_updatedAt_id_idx"
  ON "FinanceInvestment"("profileId", "status", "updatedAt", "id");
ALTER TABLE "FinanceInvestment"
  ADD CONSTRAINT "FinanceInvestment_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "FinanceProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FinanceInvestmentCashFlow" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "investmentId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "kind" "FinanceInvestmentCashFlowKind" NOT NULL,
  "amountInInvestmentCurrency" DECIMAL(65,30) NOT NULL,
  "exchangeRateToInvestment" DECIMAL(65,30) NOT NULL,
  "investmentRateAt" TIMESTAMP(3) NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceInvestmentCashFlow_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceInvestmentCashFlow_amount_check"
    CHECK ("amountInInvestmentCurrency" > 0 AND "exchangeRateToInvestment" > 0)
);

CREATE UNIQUE INDEX "FinanceInvestmentCashFlow_transactionId_key"
  ON "FinanceInvestmentCashFlow"("transactionId");
CREATE UNIQUE INDEX "FinanceInvestmentCashFlow_profileId_idempotencyKey_key"
  ON "FinanceInvestmentCashFlow"("profileId", "idempotencyKey");
CREATE INDEX "FinanceInvestmentCashFlow_investmentId_occurredAt_id_idx"
  ON "FinanceInvestmentCashFlow"("investmentId", "occurredAt", "id");
CREATE INDEX "FinanceInvestmentCashFlow_profileId_occurredAt_id_idx"
  ON "FinanceInvestmentCashFlow"("profileId", "occurredAt", "id");
CREATE INDEX "FinanceInvestmentCashFlow_accountId_occurredAt_id_idx"
  ON "FinanceInvestmentCashFlow"("accountId", "occurredAt", "id");

ALTER TABLE "FinanceInvestmentCashFlow"
  ADD CONSTRAINT "FinanceInvestmentCashFlow_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "FinanceProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceInvestmentCashFlow_investmentId_fkey"
  FOREIGN KEY ("investmentId") REFERENCES "FinanceInvestment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceInvestmentCashFlow_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceInvestmentCashFlow_transactionId_fkey"
  FOREIGN KEY ("transactionId") REFERENCES "FinanceTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "FinanceInvestmentValuation" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "investmentId" TEXT NOT NULL,
  "value" DECIMAL(65,30) NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "valuationCurrency" VARCHAR(3) NOT NULL DEFAULT 'USD',
  "amountInValuationCurrency" DECIMAL(65,30) NOT NULL,
  "exchangeRateToValuation" DECIMAL(65,30) NOT NULL,
  "valuationRateAt" TIMESTAMP(3) NOT NULL,
  "valuedAt" TIMESTAMP(3) NOT NULL,
  "note" TEXT,
  "correctsValuationId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceInvestmentValuation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceInvestmentValuation_amount_check"
    CHECK ("value" >= 0 AND "amountInValuationCurrency" >= 0 AND "exchangeRateToValuation" > 0)
);

CREATE UNIQUE INDEX "FinanceInvestmentValuation_correctsValuationId_key"
  ON "FinanceInvestmentValuation"("correctsValuationId");
CREATE UNIQUE INDEX "FinanceInvestmentValuation_profileId_idempotencyKey_key"
  ON "FinanceInvestmentValuation"("profileId", "idempotencyKey");
CREATE INDEX "FinanceInvestmentValuation_investmentId_valuedAt_id_idx"
  ON "FinanceInvestmentValuation"("investmentId", "valuedAt", "id");
CREATE INDEX "FinanceInvestmentValuation_profileId_valuedAt_id_idx"
  ON "FinanceInvestmentValuation"("profileId", "valuedAt", "id");

ALTER TABLE "FinanceInvestmentValuation"
  ADD CONSTRAINT "FinanceInvestmentValuation_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "FinanceProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceInvestmentValuation_investmentId_fkey"
  FOREIGN KEY ("investmentId") REFERENCES "FinanceInvestment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceInvestmentValuation_correctsValuationId_fkey"
  FOREIGN KEY ("correctsValuationId") REFERENCES "FinanceInvestmentValuation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
