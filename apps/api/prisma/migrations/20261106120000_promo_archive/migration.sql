ALTER TABLE "Promo" ADD COLUMN "archivedAt" TIMESTAMP(3);
CREATE INDEX "Promo_workspaceId_archivedAt_idx" ON "Promo"("workspaceId", "archivedAt");
