CREATE TABLE "TelegramAiPostingSettings" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "telegramChannelId" TEXT NOT NULL,
  "configuration" JSONB NOT NULL,
  "configurationVersion" INTEGER NOT NULL DEFAULT 1,
  "autopilotEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramAiPostingSettings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TelegramAiPostingSettings_telegramChannelId_key" ON "TelegramAiPostingSettings"("telegramChannelId");
CREATE INDEX "TelegramAiPostingSettings_workspaceId_autopilotEnabled_idx" ON "TelegramAiPostingSettings"("workspaceId", "autopilotEnabled");
ALTER TABLE "TelegramAiPostingSettings" ADD CONSTRAINT "TelegramAiPostingSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAiPostingSettings" ADD CONSTRAINT "TelegramAiPostingSettings_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
