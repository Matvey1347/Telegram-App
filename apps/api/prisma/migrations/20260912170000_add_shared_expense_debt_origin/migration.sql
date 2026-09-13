ALTER TABLE "FinanceDebt"
  ADD COLUMN "originTransactionId" TEXT;

ALTER TABLE "FinanceDebt"
  ADD CONSTRAINT "FinanceDebt_originTransactionId_fkey"
  FOREIGN KEY ("originTransactionId") REFERENCES "FinanceTransaction"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "FinanceDebt_originTransactionId_idx"
  ON "FinanceDebt"("originTransactionId");
