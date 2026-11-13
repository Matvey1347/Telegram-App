-- Earlier local development runs may already have applied the retired DROP
-- migration. Restore its ignored column on those databases without changing
-- any production value or overwriting an existing column.
ALTER TABLE "WorkspaceMember"
  ADD COLUMN IF NOT EXISTS "salesCommissionRate" DECIMAL(65,30);
