ALTER TABLE "Workspace"
  ADD COLUMN "telegramNotificationChatId" TEXT,
  ADD COLUMN "telegramNotificationChatTitle" TEXT,
  ADD COLUMN "telegramNotificationLinkTokenHash" TEXT,
  ADD COLUMN "telegramNotificationLinkExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Workspace_telegramNotificationLinkTokenHash_key"
  ON "Workspace"("telegramNotificationLinkTokenHash");
