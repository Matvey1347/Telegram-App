ALTER TABLE "Workspace"
  ADD COLUMN "telegramNotificationUserId" TEXT,
  ADD COLUMN "telegramNotificationUserChatId" TEXT,
  ADD COLUMN "telegramNotificationUserName" TEXT,
  ADD COLUMN "telegramNotificationAccountLinkTokenHash" TEXT,
  ADD COLUMN "telegramNotificationAccountLinkExpiresAt" TIMESTAMP(3),
  ADD COLUMN "telegramNotificationAccountLinkTelegramUserId" TEXT;

CREATE UNIQUE INDEX "Workspace_telegramNotificationAccountLinkTokenHash_key"
  ON "Workspace"("telegramNotificationAccountLinkTokenHash");
