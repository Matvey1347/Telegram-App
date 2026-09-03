-- Customer-facing CRM automations are removed. Preserve historical messages,
-- but remove every configuration and runtime path that could send a new one.

DELETE FROM "WorkspaceRolePermission"
WHERE "permissionKey" = 'adSales.crm.manageAutomation';

DELETE FROM "ScheduledTaskConfig"
WHERE "taskKey" = 'telegram_crm.customer_automations';

DELETE FROM "OperationsNotification"
WHERE "type" = 'CRM_AUTOMATION_BLOCKED'::"OperationsNotificationType";

UPDATE "TelegramCrmMessage"
SET "origin" = 'SYSTEM'::"TelegramCrmMessageOrigin"
WHERE "origin" = 'AUTOMATION'::"TelegramCrmMessageOrigin";

ALTER TABLE "TelegramCrmMessage"
  DROP CONSTRAINT IF EXISTS "TelegramCrmMessage_automationExecution_workspace_fkey",
  DROP COLUMN IF EXISTS "automationExecutionId";

DROP TABLE IF EXISTS "TelegramCrmCustomerAutomationExecution";

ALTER TABLE "TelegramAdSale"
  DROP COLUMN IF EXISTS "customerAutomationOverride",
  DROP COLUMN IF EXISTS "customerAutomationEligibleAt",
  DROP COLUMN IF EXISTS "prePublicationAutomationOverride",
  DROP COLUMN IF EXISTS "prePublicationAutomationEnabledAt",
  DROP COLUMN IF EXISTS "publishedLinksAutomationOverride",
  DROP COLUMN IF EXISTS "publishedLinksAutomationEnabledAt",
  DROP COLUMN IF EXISTS "followUpAutomationOverride",
  DROP COLUMN IF EXISTS "followUpAutomationEnabledAt",
  DROP COLUMN IF EXISTS "crmConversationId",
  DROP COLUMN IF EXISTS "customerFollowUpAt",
  DROP COLUMN IF EXISTS "customerFollowUpVersion";

ALTER TABLE "TelegramAdvertiser"
  DROP COLUMN IF EXISTS "automatedMessagesEnabled",
  DROP COLUMN IF EXISTS "automatedMessagesEnabledAt",
  DROP COLUMN IF EXISTS "automationLocale",
  DROP COLUMN IF EXISTS "prePublicationAutomationOverride",
  DROP COLUMN IF EXISTS "prePublicationAutomationEnabledAt",
  DROP COLUMN IF EXISTS "publishedLinksAutomationOverride",
  DROP COLUMN IF EXISTS "publishedLinksAutomationEnabledAt",
  DROP COLUMN IF EXISTS "followUpAutomationOverride",
  DROP COLUMN IF EXISTS "followUpAutomationEnabledAt";

ALTER TABLE "TelegramAdCrmWorkspaceSettings"
  DROP COLUMN IF EXISTS "customerTelegramAutomationsEnabled",
  DROP COLUMN IF EXISTS "customerTelegramAutomationsEnabledAt",
  DROP COLUMN IF EXISTS "automationLocale",
  DROP COLUMN IF EXISTS "prePublicationReminderEnabled",
  DROP COLUMN IF EXISTS "prePublicationReminderEnabledAt",
  DROP COLUMN IF EXISTS "publishedLinksEnabled",
  DROP COLUMN IF EXISTS "publishedLinksEnabledAt",
  DROP COLUMN IF EXISTS "followUpEnabled",
  DROP COLUMN IF EXISTS "followUpEnabledAt";

ALTER TYPE "TelegramCrmMessageOrigin" RENAME TO "TelegramCrmMessageOrigin_old";
CREATE TYPE "TelegramCrmMessageOrigin" AS ENUM ('MANUAL', 'SYSTEM', 'TELEGRAM_SYNC');
ALTER TABLE "TelegramCrmMessage"
  ALTER COLUMN "origin" TYPE "TelegramCrmMessageOrigin"
  USING ("origin"::text::"TelegramCrmMessageOrigin");
DROP TYPE "TelegramCrmMessageOrigin_old";

ALTER TYPE "OperationsNotificationType" RENAME TO "OperationsNotificationType_old";
CREATE TYPE "OperationsNotificationType" AS ENUM (
  'CRM_MESSAGE_RECEIVED',
  'CRM_FOLLOW_UP_DUE',
  'CRM_PLACEMENT_FAILURE'
);
ALTER TABLE "OperationsNotification"
  ALTER COLUMN "type" TYPE "OperationsNotificationType"
  USING ("type"::text::"OperationsNotificationType");
DROP TYPE "OperationsNotificationType_old";

DROP TYPE IF EXISTS "TelegramCrmCustomerAutomationExecutionStatus";
DROP TYPE IF EXISTS "TelegramCrmCustomerAutomationType";
DROP TYPE IF EXISTS "TelegramCrmAutomationOverride";
