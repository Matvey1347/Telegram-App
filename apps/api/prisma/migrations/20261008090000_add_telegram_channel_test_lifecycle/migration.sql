ALTER TABLE "TelegramChannel"
ADD COLUMN "isTest" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "TelegramChannel_workspaceId_isTest_archivedAt_createdAt_id_idx"
ON "TelegramChannel"("workspaceId", "isTest", "archivedAt", "createdAt", "id");
