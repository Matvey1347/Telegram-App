ALTER TABLE "TelegramManagedPost" ADD COLUMN "jsonImportKey" TEXT;

CREATE UNIQUE INDEX "TelegramManagedPost_workspaceId_telegramChannelId_jsonImportKey_key"
ON "TelegramManagedPost"("workspaceId", "telegramChannelId", "jsonImportKey");
