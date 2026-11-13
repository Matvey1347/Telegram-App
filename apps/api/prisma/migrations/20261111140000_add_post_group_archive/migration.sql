ALTER TABLE "PostGroup" ADD COLUMN "archivedAt" TIMESTAMP(3);
CREATE INDEX "PostGroup_workspaceId_telegramChannelId_archivedAt_idx"
  ON "PostGroup"("workspaceId", "telegramChannelId", "archivedAt");
