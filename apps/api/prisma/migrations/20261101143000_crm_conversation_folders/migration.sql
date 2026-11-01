-- Canonical Telegram folders are account-scoped and independent of CRM contacts/tags.
CREATE TABLE "TelegramCrmFolder" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "mtprotoAccountId" TEXT NOT NULL,
  "telegramFolderId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT,
  "emojiPresentation" JSONB,
  "excludeRead" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramCrmFolder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TelegramCrmFolder_workspace_account_native_key" ON "TelegramCrmFolder"("workspaceId", "mtprotoAccountId", "telegramFolderId");
CREATE UNIQUE INDEX "TelegramCrmFolder_id_workspace_account_key" ON "TelegramCrmFolder"("id", "workspaceId", "mtprotoAccountId");
CREATE INDEX "TelegramCrmFolder_workspace_active_account_idx" ON "TelegramCrmFolder"("workspaceId", "isActive", "mtprotoAccountId");
ALTER TABLE "TelegramCrmFolder" ADD CONSTRAINT "TelegramCrmFolder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramCrmFolder" ADD CONSTRAINT "TelegramCrmFolder_account_workspace_fkey" FOREIGN KEY ("mtprotoAccountId", "workspaceId") REFERENCES "TelegramUserAccountIntegration"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TelegramCrmConversationFolder" (
  "conversationId" TEXT NOT NULL,
  "folderId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "mtprotoAccountId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramCrmConversationFolder_pkey" PRIMARY KEY ("conversationId", "folderId")
);
CREATE INDEX "TelegramCrmConversationFolder_workspace_folder_idx" ON "TelegramCrmConversationFolder"("workspaceId", "folderId", "conversationId");
CREATE INDEX "TelegramCrmConversationFolder_workspace_account_idx" ON "TelegramCrmConversationFolder"("workspaceId", "mtprotoAccountId", "conversationId");
ALTER TABLE "TelegramCrmConversationFolder" ADD CONSTRAINT "CrmConversationFolder_conversation_scope_fkey" FOREIGN KEY ("conversationId", "workspaceId", "mtprotoAccountId") REFERENCES "TelegramCrmConversation"("id", "workspaceId", "mtprotoAccountId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramCrmConversationFolder" ADD CONSTRAINT "CrmConversationFolder_folder_scope_fkey" FOREIGN KEY ("folderId", "workspaceId", "mtprotoAccountId") REFERENCES "TelegramCrmFolder"("id", "workspaceId", "mtprotoAccountId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve existing folder IDs and known linked memberships without inventing
-- unlinked membership. A bounded MTProto dialog sync supplies the missing data.
INSERT INTO "TelegramCrmFolder" ("id", "workspaceId", "mtprotoAccountId", "telegramFolderId", "name", "color", "excludeRead", "isActive", "createdAt", "updatedAt")
SELECT tag."id", tag."workspaceId", account."id", split_part(tag."systemKey", ':', 3)::integer, tag."name", tag."color", false, true, tag."createdAt", tag."updatedAt"
FROM "TelegramAdvertiserTag" tag
JOIN "TelegramUserAccountIntegration" account ON account."id" = split_part(tag."systemKey", ':', 2) AND account."workspaceId" = tag."workspaceId"
WHERE tag."systemKey" ~ '^TELEGRAM_FOLDER:[^:]+:[0-9]{1,9}$'
ON CONFLICT DO NOTHING;
INSERT INTO "TelegramCrmConversationFolder" ("conversationId", "folderId", "workspaceId", "mtprotoAccountId")
SELECT conversation."id", folder."id", folder."workspaceId", folder."mtprotoAccountId"
FROM "TelegramCrmFolder" folder
JOIN "TelegramAdvertiserTagAssignment" assignment ON assignment."tagId" = folder."id" AND assignment."workspaceId" = folder."workspaceId"
JOIN "TelegramCrmConversation" conversation ON conversation."contactId" = assignment."advertiserId" AND conversation."workspaceId" = folder."workspaceId" AND conversation."mtprotoAccountId" = folder."mtprotoAccountId"
ON CONFLICT DO NOTHING;

ALTER TABLE "TelegramCrmAccountSyncState" ADD COLUMN "folderRefreshVersion" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "folderReconciledVersion" INTEGER NOT NULL DEFAULT 0;
