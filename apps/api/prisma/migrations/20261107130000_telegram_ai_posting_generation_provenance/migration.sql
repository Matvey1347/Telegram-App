CREATE TABLE "TelegramAiPostingGeneration" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "telegramChannelId" TEXT NOT NULL,
  "managedPostId" TEXT NOT NULL,
  "settingsVersion" INTEGER NOT NULL,
  "attempts" INTEGER NOT NULL,
  "ideaSources" JSONB NOT NULL,
  "modelUsage" JSONB NOT NULL,
  "planningCost" DECIMAL(24,12),
  "textCost" DECIMAL(24,12),
  "imageCost" DECIMAL(24,12),
  "reviewCost" DECIMAL(24,12),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramAiPostingGeneration_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TelegramAiPostingGeneration_managedPostId_key" ON "TelegramAiPostingGeneration"("managedPostId");
CREATE INDEX "TelegramAiPostingGeneration_workspaceId_telegramChannelId_createdAt_idx" ON "TelegramAiPostingGeneration"("workspaceId", "telegramChannelId", "createdAt");
ALTER TABLE "TelegramAiPostingGeneration" ADD CONSTRAINT "TelegramAiPostingGeneration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAiPostingGeneration" ADD CONSTRAINT "TelegramAiPostingGeneration_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAiPostingGeneration" ADD CONSTRAINT "TelegramAiPostingGeneration_managedPostId_fkey" FOREIGN KEY ("managedPostId") REFERENCES "TelegramManagedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
