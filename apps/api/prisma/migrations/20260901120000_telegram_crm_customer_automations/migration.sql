-- CRM customer automation execution layer.
-- Safety invariant: this migration creates no occurrences, executions,
-- messages, conversations, or Telegram work, and backfills no activation or
-- Deal eligibility timestamps. Existing Deals remain protected by the Stage 1
-- DISABLED/null cutover written in 20260831160000_telegram_crm_foundation.

ALTER TYPE "TelegramCrmCustomerAutomationExecutionStatus"
  ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "TelegramCrmCustomerAutomationExecutionStatus"
  ADD VALUE IF NOT EXISTS 'SENDING';
ALTER TYPE "TelegramCrmCustomerAutomationExecutionStatus"
  ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TABLE "TelegramAdCrmWorkspaceSettings"
  ADD COLUMN "automationLocale" VARCHAR(2) NOT NULL DEFAULT 'en',
  ADD COLUMN "prePublicationReminderEnabledAt" TIMESTAMP(3),
  ADD COLUMN "publishedLinksEnabledAt" TIMESTAMP(3),
  ADD COLUMN "followUpEnabledAt" TIMESTAMP(3);

ALTER TABLE "TelegramAdvertiser"
  ADD COLUMN "automationLocale" VARCHAR(2),
  ADD COLUMN "prePublicationAutomationOverride" "TelegramCrmAutomationOverride" NOT NULL DEFAULT 'INHERIT',
  ADD COLUMN "prePublicationAutomationEnabledAt" TIMESTAMP(3),
  ADD COLUMN "publishedLinksAutomationOverride" "TelegramCrmAutomationOverride" NOT NULL DEFAULT 'INHERIT',
  ADD COLUMN "publishedLinksAutomationEnabledAt" TIMESTAMP(3),
  ADD COLUMN "followUpAutomationOverride" "TelegramCrmAutomationOverride" NOT NULL DEFAULT 'INHERIT',
  ADD COLUMN "followUpAutomationEnabledAt" TIMESTAMP(3);

ALTER TABLE "TelegramAdSale"
  ADD COLUMN "prePublicationAutomationOverride" "TelegramCrmAutomationOverride" NOT NULL DEFAULT 'INHERIT',
  ADD COLUMN "prePublicationAutomationEnabledAt" TIMESTAMP(3),
  ADD COLUMN "publishedLinksAutomationOverride" "TelegramCrmAutomationOverride" NOT NULL DEFAULT 'INHERIT',
  ADD COLUMN "publishedLinksAutomationEnabledAt" TIMESTAMP(3),
  ADD COLUMN "followUpAutomationOverride" "TelegramCrmAutomationOverride" NOT NULL DEFAULT 'INHERIT',
  ADD COLUMN "followUpAutomationEnabledAt" TIMESTAMP(3),
  ADD COLUMN "crmConversationId" TEXT,
  ADD COLUMN "customerFollowUpAt" TIMESTAMP(3),
  ADD COLUMN "customerFollowUpVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "TelegramCrmCustomerAutomationExecution"
  ADD COLUMN "dueAt" TIMESTAMP(3),
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN "leaseOwner" TEXT,
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "conversationId" TEXT,
  ADD COLUMN "mtprotoAccountId" TEXT,
  ADD COLUMN "renderedText" TEXT,
  ADD COLUMN "templateKey" TEXT,
  ADD COLUMN "locale" VARCHAR(2),
  ADD COLUMN "stableRandomId" TEXT,
  ADD COLUMN "sourceVersion" VARCHAR(64) NOT NULL DEFAULT '1',
  ADD COLUMN "historical" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reason" TEXT;

-- Keep Deal/placement references workspace-scoped. Delete commands explicitly
-- unlink these mutable references inside the same transaction so the immutable
-- customer-message audit record survives without weakening tenant isolation.
ALTER TABLE "TelegramCrmCustomerAutomationExecution"
  DROP CONSTRAINT "TelegramCrmCustomerAutomationExecution_saleId_fkey",
  DROP CONSTRAINT "TelegramCrmCustomerAutomationExecution_placementId_fkey",
  ADD CONSTRAINT "TelegramCrmCustomerAutomationExecution_saleId_fkey"
    FOREIGN KEY ("telegramAdSaleId", "workspaceId")
    REFERENCES "TelegramAdSale"("id", "workspaceId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TelegramCrmCustomerAutomationExecution_placementId_fkey"
    FOREIGN KEY ("placementId", "workspaceId")
    REFERENCES "TelegramAdSalePlacement"("id", "workspaceId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TelegramAdSale"
  ADD CONSTRAINT "TelegramAdSale_crmConversation_workspace_fkey"
  FOREIGN KEY ("crmConversationId", "workspaceId")
  REFERENCES "TelegramCrmConversation"("id", "workspaceId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TelegramCrmCustomerAutomationExecution"
  ADD CONSTRAINT "TelegramCrmCustomerAutomationExecution_conversation_fkey"
  FOREIGN KEY ("conversationId", "workspaceId")
  REFERENCES "TelegramCrmConversation"("id", "workspaceId")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TelegramCrmCustomerAutomationExecution_account_fkey"
  FOREIGN KEY ("mtprotoAccountId", "workspaceId")
  REFERENCES "TelegramUserAccountIntegration"("id", "workspaceId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TelegramAdCrmWorkspaceSettings"
  ADD CONSTRAINT "TelegramAdCrmWorkspaceSettings_automationLocale_check"
  CHECK ("automationLocale" IN ('en', 'ru', 'uk'));
ALTER TABLE "TelegramAdvertiser"
  ADD CONSTRAINT "TelegramAdvertiser_automationLocale_check"
  CHECK ("automationLocale" IN ('en', 'ru', 'uk'));
ALTER TABLE "TelegramCrmCustomerAutomationExecution"
  ADD CONSTRAINT "TelegramCrmCustomerAutomationExecution_locale_check"
  CHECK ("locale" IS NULL OR "locale" IN ('en', 'ru', 'uk'));

CREATE INDEX "TelegramAdSale_workspaceId_customerFollowUpAt_idx"
  ON "TelegramAdSale"("workspaceId", "customerFollowUpAt");
CREATE INDEX "TelegramAdSale_workspaceId_crmConversationId_idx"
  ON "TelegramAdSale"("workspaceId", "crmConversationId");
CREATE INDEX "TelegramCrmCustomerAutomationExecution_due_claim_idx"
  ON "TelegramCrmCustomerAutomationExecution"("status", "nextAttemptAt", "id");
CREATE INDEX "TelegramCrmCustomerAutomationExecution_lease_idx"
  ON "TelegramCrmCustomerAutomationExecution"("status", "leaseExpiresAt", "id");
