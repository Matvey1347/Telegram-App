ALTER TABLE "FinanceTransaction"
ADD COLUMN "merchantDisplay" TEXT;

CREATE TABLE "FinanceTransactionItem" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "normalizedName" TEXT,
    "quantity" DECIMAL(65,30),
    "unitPrice" DECIMAL(65,30),
    "totalAmount" DECIMAL(65,30) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "categoryId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FinanceTransactionItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FinanceTransactionItem_transactionId_idx" ON "FinanceTransactionItem"("transactionId");
CREATE INDEX "FinanceTransactionItem_categoryId_idx" ON "FinanceTransactionItem"("categoryId");

ALTER TABLE "FinanceTransactionItem"
ADD CONSTRAINT "FinanceTransactionItem_transactionId_fkey"
FOREIGN KEY ("transactionId") REFERENCES "FinanceTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FinanceTransactionItem"
ADD CONSTRAINT "FinanceTransactionItem_categoryId_fkey"
FOREIGN KEY ("categoryId") REFERENCES "FinanceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "FinanceAiUsage_profileId_feature_status_createdAt_idx"
ON "FinanceAiUsage"("profileId", "feature", "status", "createdAt");
