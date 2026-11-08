CREATE TABLE "TelegramAiPostingTestRun" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "telegramChannelId" TEXT NOT NULL,
  "requestedCount" INTEGER NOT NULL,
  "settingsVersion" INTEGER NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL,
  "publications" JSONB NOT NULL,
  "failures" JSONB NOT NULL,
  "operations" JSONB NOT NULL,
  "feedback" JSONB NOT NULL,
  "planningCost" DECIMAL(24,12),
  "textCost" DECIMAL(24,12),
  "imageCost" DECIMAL(24,12),
  "reviewCost" DECIMAL(24,12),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramAiPostingTestRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TelegramAiPostingTestRun_workspaceId_telegramChannelId_createdAt_idx"
ON "TelegramAiPostingTestRun"("workspaceId", "telegramChannelId", "createdAt");
ALTER TABLE "TelegramAiPostingTestRun" ADD CONSTRAINT "TelegramAiPostingTestRun_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAiPostingTestRun" ADD CONSTRAINT "TelegramAiPostingTestRun_telegramChannelId_fkey"
FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
