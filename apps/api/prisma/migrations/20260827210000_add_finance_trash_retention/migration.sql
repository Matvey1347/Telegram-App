ALTER TABLE "Account" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Transaction" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "TransactionCategory" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Transfer" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "Account_workspaceId_deletedAt_idx" ON "Account"("workspaceId", "deletedAt");
CREATE INDEX "Transaction_workspaceId_deletedAt_idx" ON "Transaction"("workspaceId", "deletedAt");
CREATE INDEX "TransactionCategory_workspaceId_deletedAt_idx" ON "TransactionCategory"("workspaceId", "deletedAt");
CREATE INDEX "Transfer_workspaceId_deletedAt_idx" ON "Transfer"("workspaceId", "deletedAt");
