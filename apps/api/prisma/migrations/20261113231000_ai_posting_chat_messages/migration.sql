CREATE TABLE "TelegramAiPostingChatMessage" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "telegramChannelId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramAiPostingChatMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TelegramAiPostingChatMessage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TelegramAiPostingChatMessage_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TelegramAiPostingChatMessage_workspaceId_telegramChannelId_createdAt_id_idx" ON "TelegramAiPostingChatMessage"("workspaceId", "telegramChannelId", "createdAt", "id");
