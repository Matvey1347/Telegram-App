-- CRM Stage 2 runtime/read-model columns only. This migration intentionally
-- creates no Contact, Conversation, Message, sync-state, or automation rows,
-- and it never enables CRM sync/send or customer automations.

ALTER TYPE "TelegramCrmConversationState" ADD VALUE 'IGNORED';

ALTER TABLE "TelegramAdvertiser"
  ADD COLUMN "lastInboundAt" TIMESTAMP(3),
  ADD COLUMN "lastOutboundAt" TIMESTAMP(3);

ALTER TABLE "TelegramCrmConversation"
  ADD COLUMN "telegramAccessHash" TEXT,
  ADD COLUMN "historyCursorTelegramMessageId" INTEGER,
  ADD COLUMN "historyExhausted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lastReadInboxTelegramMessageId" INTEGER,
  ADD COLUMN "lastReadOutboxTelegramMessageId" INTEGER;

ALTER TABLE "TelegramCrmMessage"
  ADD COLUMN "telegramMessageIdNumeric" INTEGER,
  ADD COLUMN "clientIdempotencyKey" TEXT;

ALTER TABLE "TelegramCrmAccountSyncState"
  ADD COLUMN "initialImportCursor" TEXT;

CREATE INDEX "TelegramUserAccountIntegration_crm_runtime_idx"
  ON "TelegramUserAccountIntegration"("crmSyncEnabled", "isActive", "status", "id");
CREATE INDEX "TelegramCrmConversation_workspace_contact_state_last_idx"
  ON "TelegramCrmConversation"("workspaceId", "contactId", "state", "lastMessageAt", "id");
CREATE UNIQUE INDEX "TelegramCrmMessage_conversation_clientIdempotency_key"
  ON "TelegramCrmMessage"("conversationId", "clientIdempotencyKey");
CREATE INDEX "TelegramCrmMessage_conversation_direction_numeric_idx"
  ON "TelegramCrmMessage"("conversationId", "direction", "telegramMessageIdNumeric");
CREATE INDEX "TelegramCrmCustomerAutomationExecution_contact_created_idx"
  ON "TelegramCrmCustomerAutomationExecution"("workspaceId", "contactId", "createdAt", "id");
CREATE INDEX "TelegramAdvertiserAutomationExecution_contact_created_idx"
  ON "TelegramAdvertiserAutomationExecution"("workspaceId", "advertiserId", "createdAt", "id");
