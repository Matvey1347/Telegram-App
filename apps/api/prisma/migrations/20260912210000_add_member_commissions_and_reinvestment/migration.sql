CREATE TYPE "InvestmentOrigin" AS ENUM ('EXTERNAL', 'SALARY', 'REINVESTMENT');
CREATE TYPE "InvestmentMovementType" AS ENUM ('CONTRIBUTION', 'WITHDRAWAL');
CREATE TYPE "MemberCompensationSettlementType" AS ENUM ('PAYOUT', 'INVESTMENT');

ALTER TABLE "WorkspaceMember"
ADD COLUMN "salesCommissionRate" DECIMAL(65,30);

ALTER TABLE "TelegramAdSalesWorkspaceSettings"
ADD COLUMN "salesCommissionEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "defaultSalesCommissionRate" DECIMAL(65,30) NOT NULL DEFAULT 0;

ALTER TABLE "TelegramAdSale"
ADD COLUMN "sellerMemberId" TEXT,
ADD COLUMN "sellerCommissionEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "sellerCommissionRate" DECIMAL(65,30) NOT NULL DEFAULT 0;

ALTER TABLE "Investment"
ALTER COLUMN "accountId" DROP NOT NULL,
ADD COLUMN "origin" "InvestmentOrigin" NOT NULL DEFAULT 'EXTERNAL',
ADD COLUMN "movementType" "InvestmentMovementType" NOT NULL DEFAULT 'CONTRIBUTION',
ADD COLUMN "reinvestmentDistributionId" TEXT;

CREATE TABLE "MemberCompensationSettlement" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "workspaceMemberId" TEXT NOT NULL,
  "type" "MemberCompensationSettlementType" NOT NULL,
  "amountInPrimaryCurrency" DECIMAL(65,30) NOT NULL,
  "transactionId" TEXT,
  "investmentId" TEXT,
  "date" TIMESTAMP(3) NOT NULL,
  "notes" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MemberCompensationSettlement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReinvestmentDistribution" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "profitInPrimaryCurrency" DECIMAL(65,30) NOT NULL,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReinvestmentDistribution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MemberCompensationSettlement_transactionId_key" ON "MemberCompensationSettlement"("transactionId");
CREATE UNIQUE INDEX "MemberCompensationSettlement_investmentId_key" ON "MemberCompensationSettlement"("investmentId");
CREATE INDEX "MemberCompensationSettlement_workspaceId_workspaceMemberId_date_idx" ON "MemberCompensationSettlement"("workspaceId", "workspaceMemberId", "date");
CREATE UNIQUE INDEX "ReinvestmentDistribution_workspaceId_periodStart_periodEnd_key" ON "ReinvestmentDistribution"("workspaceId", "periodStart", "periodEnd");
CREATE INDEX "ReinvestmentDistribution_workspaceId_createdAt_idx" ON "ReinvestmentDistribution"("workspaceId", "createdAt");
CREATE INDEX "Investment_workspaceId_workspaceMemberId_origin_movementType_idx" ON "Investment"("workspaceId", "workspaceMemberId", "origin", "movementType");
CREATE INDEX "Investment_reinvestmentDistributionId_idx" ON "Investment"("reinvestmentDistributionId");
CREATE INDEX "TelegramAdSale_workspaceId_sellerMemberId_idx" ON "TelegramAdSale"("workspaceId", "sellerMemberId");

ALTER TABLE "TelegramAdSale" ADD CONSTRAINT "TelegramAdSale_sellerMemberId_fkey" FOREIGN KEY ("sellerMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MemberCompensationSettlement" ADD CONSTRAINT "MemberCompensationSettlement_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberCompensationSettlement" ADD CONSTRAINT "MemberCompensationSettlement_workspaceMemberId_fkey" FOREIGN KEY ("workspaceMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MemberCompensationSettlement" ADD CONSTRAINT "MemberCompensationSettlement_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MemberCompensationSettlement" ADD CONSTRAINT "MemberCompensationSettlement_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "Investment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReinvestmentDistribution" ADD CONSTRAINT "ReinvestmentDistribution_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_reinvestmentDistributionId_fkey" FOREIGN KEY ("reinvestmentDistributionId") REFERENCES "ReinvestmentDistribution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkspaceMember"
ADD CONSTRAINT "WorkspaceMember_salesCommissionRate_check"
CHECK ("salesCommissionRate" IS NULL OR ("salesCommissionRate" >= 0 AND "salesCommissionRate" <= 100));

ALTER TABLE "TelegramAdSalesWorkspaceSettings"
ADD CONSTRAINT "TelegramAdSalesWorkspaceSettings_defaultSalesCommissionRate_check"
CHECK ("defaultSalesCommissionRate" >= 0 AND "defaultSalesCommissionRate" <= 100);

ALTER TABLE "TelegramAdSale"
ADD CONSTRAINT "TelegramAdSale_sellerCommissionRate_check"
CHECK ("sellerCommissionRate" >= 0 AND "sellerCommissionRate" <= 100);

ALTER TABLE "MemberCompensationSettlement"
ADD CONSTRAINT "MemberCompensationSettlement_reference_check"
CHECK (
  ("type" = 'PAYOUT' AND "transactionId" IS NOT NULL AND "investmentId" IS NULL)
  OR
  ("type" = 'INVESTMENT' AND "investmentId" IS NOT NULL AND "transactionId" IS NULL)
);
