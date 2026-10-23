ALTER TABLE "FinanceProfile"
ADD COLUMN "classifyExpenses" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "splitExpenses" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "defaultExpenseCategoryId" TEXT,
ADD COLUMN "defaultIncomeCategoryId" TEXT;
