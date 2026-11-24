ALTER TABLE "FinanceAssistantChat" ADD COLUMN "archivedAt" TIMESTAMP(3);
DROP INDEX "FinanceAssistantChat_profileId_updatedAt_id_idx";
CREATE INDEX "FinanceAssistantChat_profileId_archivedAt_updatedAt_id_idx"
    ON "FinanceAssistantChat"("profileId", "archivedAt", "updatedAt", "id");
