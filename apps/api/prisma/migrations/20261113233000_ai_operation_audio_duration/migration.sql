ALTER TABLE "AiOperation" ADD COLUMN "audioDurationSeconds" DECIMAL(12,3);
ALTER TABLE "TelegramAiPostingChatMessage" ADD COLUMN "metadata" JSONB;
CREATE TABLE "TelegramAiPostingChatAttachment" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "telegramChannelId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "durationSeconds" DECIMAL(12,3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramAiPostingChatAttachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TelegramAiPostingChatAttachment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TelegramAiPostingChatAttachment_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TelegramAiPostingChatAttachment_scope_expiry_idx" ON "TelegramAiPostingChatAttachment"("workspaceId", "telegramChannelId", "actorUserId", "expiresAt");
CREATE INDEX "TelegramAiPostingChatAttachment_expiresAt_idx" ON "TelegramAiPostingChatAttachment"("expiresAt");
