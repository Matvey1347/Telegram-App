CREATE INDEX "FinanceCategory_profileId_archivedAt_idx"
  ON "FinanceCategory"("profileId", "archivedAt");

CREATE INDEX "FinanceTransaction_profileId_deletedAt_idx"
  ON "FinanceTransaction"("profileId", "deletedAt");

CREATE INDEX "FinanceTransfer_profileId_deletedAt_idx"
  ON "FinanceTransfer"("profileId", "deletedAt");
