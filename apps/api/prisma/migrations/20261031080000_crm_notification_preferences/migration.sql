-- Preserve the existing global webPushEnabled value. Incoming CRM alerts require
-- a new explicit opt-in; existing follow-up behavior and private previews remain safe.
ALTER TYPE "OperationsNotificationType" ADD VALUE IF NOT EXISTS 'CRM_AI_LEAD_QUALIFIED';
ALTER TYPE "OperationsNotificationType" ADD VALUE IF NOT EXISTS 'SYSTEM_TEST';

ALTER TABLE "OperationsNotificationPreference"
  ADD COLUMN "crmNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "crmIncomingMessagesEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "crmFollowUpEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "crmAiLeadsEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "crmMessagePreviewEnabled" BOOLEAN NOT NULL DEFAULT false;
