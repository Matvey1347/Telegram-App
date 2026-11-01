-- Additive; no media bytes or Telegram references are persisted in the receipt.
ALTER TABLE "TelegramCrmMessage" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE TABLE "TelegramCrmChatOperation" (
 "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "operationId" TEXT NOT NULL,
 "actorUserId" TEXT NOT NULL, "conversationId" TEXT NOT NULL, "mtprotoAccountId" TEXT NOT NULL,
 "targetMessageId" TEXT, "kind" TEXT NOT NULL, "requestFingerprint" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'UNKNOWN', "request" JSONB NOT NULL, "result" JSONB,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "TelegramCrmChatOperation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TelegramCrmChatOperation_workspaceId_operationId_key" ON "TelegramCrmChatOperation"("workspaceId", "operationId");
CREATE INDEX "TelegramCrmChatOperation_createdAt_id_idx" ON "TelegramCrmChatOperation"("createdAt", "id");
CREATE UNIQUE INDEX "TelegramCrmChatOperation_unknown_target_key" ON "TelegramCrmChatOperation"("workspaceId", "mtprotoAccountId", "conversationId", "targetMessageId") WHERE "status" = 'UNKNOWN' AND "targetMessageId" IS NOT NULL;

CREATE INDEX "TelegramCrmMessage_workspace_account_numeric_idx" ON "TelegramCrmMessage"("workspaceId", "mtprotoAccountId", "telegramMessageIdNumeric");
CREATE TABLE "TelegramCrmDeletedMessage" (
 "mtprotoAccountId" TEXT NOT NULL, "telegramMessageId" INTEGER NOT NULL, "workspaceId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "TelegramCrmDeletedMessage_pkey" PRIMARY KEY ("mtprotoAccountId", "telegramMessageId"),
 CONSTRAINT "TelegramCrmDeletedMessage_mtprotoAccountId_fkey" FOREIGN KEY ("mtprotoAccountId") REFERENCES "TelegramUserAccountIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TelegramCrmDeletedMessage_workspaceId_mtprotoAccountId_idx" ON "TelegramCrmDeletedMessage"("workspaceId", "mtprotoAccountId");

ALTER TABLE "TelegramCrmConversation" ADD COLUMN "unreadSnapshotTopMessageId" INTEGER;
CREATE INDEX "TelegramCrmChatOperation_mtprotoAccountId_idx" ON "TelegramCrmChatOperation"("mtprotoAccountId");
ALTER TABLE "TelegramCrmChatOperation" ADD CONSTRAINT "TelegramCrmChatOperation_account_workspace_fkey" FOREIGN KEY ("mtprotoAccountId", "workspaceId") REFERENCES "TelegramUserAccountIntegration"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramCrmConversation" ADD COLUMN "unreadSnapshotPts" INTEGER;
