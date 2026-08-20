ALTER TABLE "TelegramChannel"
ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "TelegramChannel_workspaceId_archivedAt_createdAt_id_idx"
ON "TelegramChannel"("workspaceId", "archivedAt", "createdAt", "id");
