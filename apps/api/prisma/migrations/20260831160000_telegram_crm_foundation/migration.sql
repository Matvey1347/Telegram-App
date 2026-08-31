-- Contact-centered CRM foundation. This migration is deliberately data-only:
-- it creates no conversations, messages, sync runs, due events, or customer
-- automation executions.

CREATE TYPE "TelegramCrmContactStage" AS ENUM (
  'NEW',
  'LEAD',
  'QUALIFIED',
  'FOLLOW_UP',
  'CUSTOMER',
  'LOST',
  'ARCHIVED'
);
CREATE TYPE "TelegramCrmConversationState" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "TelegramCrmMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "TelegramCrmMessageOrigin" AS ENUM (
  'MANUAL',
  'AUTOMATION',
  'SYSTEM',
  'TELEGRAM_SYNC'
);
CREATE TYPE "TelegramCrmReadState" AS ENUM ('UNKNOWN', 'UNREAD', 'READ');
CREATE TYPE "TelegramCrmDeliveryState" AS ENUM (
  'UNKNOWN',
  'PENDING',
  'SENT',
  'DELIVERED',
  'FAILED'
);
CREATE TYPE "TelegramCrmInitialImportStatus" AS ENUM (
  'NOT_STARTED',
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED'
);
CREATE TYPE "TelegramCrmSyncStatus" AS ENUM (
  'IDLE',
  'SYNCING',
  'RECOVERING',
  'FAILED'
);
CREATE TYPE "TelegramCrmCustomerAutomationType" AS ENUM (
  'PRE_PUBLICATION_REMINDER',
  'PUBLISHED_LINKS',
  'FOLLOW_UP'
);
CREATE TYPE "TelegramCrmAutomationOverride" AS ENUM (
  'INHERIT',
  'ENABLED',
  'DISABLED'
);
CREATE TYPE "TelegramCrmCustomerAutomationExecutionStatus" AS ENUM (
  'PENDING',
  'SENT',
  'SKIPPED',
  'FAILED'
);

ALTER TABLE "TelegramUserAccountIntegration"
  ADD COLUMN "crmSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "crmSendEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mtprotoPublishingEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Existing account publication behavior stays enabled. CRM sync/send are
-- always opt-in and deployment cannot start customer messaging.
UPDATE "TelegramUserAccountIntegration"
SET
  "crmSyncEnabled" = false,
  "crmSendEnabled" = false,
  "mtprotoPublishingEnabled" = true;

ALTER TABLE "TelegramAdvertiser"
  ADD COLUMN "stage" "TelegramCrmContactStage",
  ADD COLUMN "automatedMessagesEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "automatedMessagesEnabledAt" TIMESTAMP(3);

UPDATE "TelegramAdvertiser"
SET
  "stage" = CASE
    WHEN "archivedAt" IS NOT NULL OR "status" = 'ARCHIVED'
      THEN 'ARCHIVED'::"TelegramCrmContactStage"
    WHEN "status" IN ('LOST', 'BLOCKED') OR "lifecycleStage" = 'CHURNED'
      THEN 'LOST'::"TelegramCrmContactStage"
    WHEN "lifecycleStage" IN ('CUSTOMER', 'REPEAT_CUSTOMER')
      THEN 'CUSTOMER'::"TelegramCrmContactStage"
    WHEN "lifecycleStage" = 'QUALIFIED'
      THEN 'QUALIFIED'::"TelegramCrmContactStage"
    WHEN "lifecycleStage" = 'REACTIVATION' OR "status" = 'INACTIVE'
      THEN 'FOLLOW_UP'::"TelegramCrmContactStage"
    WHEN "lifecycleStage" = 'CONTACTED' OR "status" = 'ACTIVE'
      THEN 'LEAD'::"TelegramCrmContactStage"
    ELSE 'NEW'::"TelegramCrmContactStage"
  END,
  "automatedMessagesEnabled" = false,
  "automatedMessagesEnabledAt" = NULL;

ALTER TABLE "TelegramAdvertiser"
  ALTER COLUMN "stage" SET DEFAULT 'NEW',
  ALTER COLUMN "stage" SET NOT NULL;

ALTER TABLE "TelegramAdSale"
  ADD COLUMN "customerAutomationOverride" "TelegramCrmAutomationOverride",
  ADD COLUMN "customerAutomationEligibleAt" TIMESTAMP(3);

-- Historical/current Deals are permanently protected from rollout. Future
-- Deals use INHERIT, but remain ineligible until application code explicitly
-- assigns customerAutomationEligibleAt.
UPDATE "TelegramAdSale"
SET
  "customerAutomationOverride" = 'DISABLED',
  "customerAutomationEligibleAt" = NULL;

ALTER TABLE "TelegramAdSale"
  ALTER COLUMN "customerAutomationOverride" SET DEFAULT 'INHERIT',
  ALTER COLUMN "customerAutomationOverride" SET NOT NULL;

ALTER TABLE "TelegramAdCrmWorkspaceSettings"
  ADD COLUMN "defaultCrmSenderAccountId" TEXT,
  ADD COLUMN "customerTelegramAutomationsEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "customerTelegramAutomationsEnabledAt" TIMESTAMP(3),
  ADD COLUMN "prePublicationReminderEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "publishedLinksEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "followUpEnabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "TelegramAdCrmWorkspaceSettings"
SET
  "customerTelegramAutomationsEnabled" = false,
  "customerTelegramAutomationsEnabledAt" = NULL,
  "prePublicationReminderEnabled" = false,
  "publishedLinksEnabled" = false,
  "followUpEnabled" = false;

-- DENYLIST roles otherwise inherit newly registered permissions. Keep the two
-- new sensitive CRM capabilities fail-closed for every existing non-owner
-- role; owners retain their immutable all-permissions bypass.
INSERT INTO "WorkspaceRolePermission" (
  "id",
  "roleId",
  "permissionKey",
  "effect"
)
SELECT
  'wrp_' || MD5(r."id" || ':' || p."permissionKey"),
  r."id",
  p."permissionKey",
  'DENY'::"WorkspaceRolePermissionEffect"
FROM "WorkspaceRoleDefinition" r
CROSS JOIN (
  VALUES
    ('adSales.crm.viewAny'),
    ('adSales.crm.sendManualMessages')
) AS p("permissionKey")
WHERE r."mode" = 'DENYLIST'
  AND r."systemKey" IS DISTINCT FROM 'OWNER'
ON CONFLICT ("roleId", "permissionKey")
DO UPDATE SET "effect" = EXCLUDED."effect";

CREATE UNIQUE INDEX "TelegramUserAccountIntegration_id_workspaceId_key"
  ON "TelegramUserAccountIntegration"("id", "workspaceId");
CREATE UNIQUE INDEX "TelegramAdvertiser_id_workspaceId_key"
  ON "TelegramAdvertiser"("id", "workspaceId");
CREATE UNIQUE INDEX "TelegramAdSale_id_workspaceId_key"
  ON "TelegramAdSale"("id", "workspaceId");
CREATE UNIQUE INDEX "TelegramAdSalePlacement_id_workspaceId_key"
  ON "TelegramAdSalePlacement"("id", "workspaceId");

CREATE TABLE "TelegramCrmPeer" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "telegramUserId" TEXT NOT NULL,
  "contactId" TEXT,
  "username" TEXT,
  "firstName" TEXT,
  "lastName" TEXT,
  "photoUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramCrmPeer_pkey" PRIMARY KEY ("id")
);

-- Only stable Telegram user IDs are materialized. A duplicate legacy mapping
-- remains unattached instead of silently merging two Contacts.
WITH "identityCandidates" AS (
  SELECT
    a."workspaceId",
    BTRIM(a."telegramUserId") AS "telegramUserId",
    a."id" AS "contactId",
    LOWER(NULLIF(LTRIM(BTRIM(a."telegramUsername"), '@'), '')) AS "username",
    a."createdAt"
  FROM "TelegramAdvertiser" a
  WHERE NULLIF(BTRIM(a."telegramUserId"), '') IS NOT NULL
  UNION ALL
  SELECT
    c."workspaceId",
    BTRIM(c."normalizedValue") AS "telegramUserId",
    c."advertiserId" AS "contactId",
    LOWER(NULLIF(LTRIM(BTRIM(a."telegramUsername"), '@'), '')) AS "username",
    c."createdAt"
  FROM "TelegramAdvertiserContact" c
  INNER JOIN "TelegramAdvertiser" a ON a."id" = c."advertiserId"
  WHERE c."type" = 'TELEGRAM_USER_ID'
    AND NULLIF(BTRIM(c."normalizedValue"), '') IS NOT NULL
),
"groupedIdentities" AS (
  SELECT
    "workspaceId",
    "telegramUserId",
    CASE
      WHEN COUNT(DISTINCT "contactId") = 1 THEN MIN("contactId")
      ELSE NULL
    END AS "contactId",
    MIN("username") AS "username",
    MIN("createdAt") AS "createdAt"
  FROM "identityCandidates"
  GROUP BY "workspaceId", "telegramUserId"
)
INSERT INTO "TelegramCrmPeer" (
  "id",
  "workspaceId",
  "telegramUserId",
  "contactId",
  "username",
  "createdAt",
  "updatedAt"
)
SELECT
  'crmpeer_' || MD5(g."workspaceId" || ':' || g."telegramUserId"),
  g."workspaceId",
  g."telegramUserId",
  g."contactId",
  g."username",
  g."createdAt",
  CURRENT_TIMESTAMP
FROM "groupedIdentities" g;

CREATE UNIQUE INDEX "TelegramCrmPeer_workspaceId_telegramUserId_key"
  ON "TelegramCrmPeer"("workspaceId", "telegramUserId");
CREATE UNIQUE INDEX "TelegramCrmPeer_id_workspaceId_key"
  ON "TelegramCrmPeer"("id", "workspaceId");
CREATE INDEX "TelegramCrmPeer_workspaceId_contactId_idx"
  ON "TelegramCrmPeer"("workspaceId", "contactId");

CREATE TABLE "TelegramCrmConversation" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "telegramCrmPeerId" TEXT NOT NULL,
  "contactId" TEXT,
  "mtprotoAccountId" TEXT NOT NULL,
  "telegramDialogId" TEXT NOT NULL,
  "state" "TelegramCrmConversationState" NOT NULL DEFAULT 'ACTIVE',
  "lastMessageAt" TIMESTAMP(3),
  "lastInboundAt" TIMESTAMP(3),
  "lastOutboundAt" TIMESTAMP(3),
  "unreadCount" INTEGER NOT NULL DEFAULT 0,
  "readState" "TelegramCrmReadState" NOT NULL DEFAULT 'UNKNOWN',
  "lastReadTelegramMessageId" TEXT,
  "lastReadAt" TIMESTAMP(3),
  "incrementalSyncCheckpoint" TEXT,
  "recoveryCheckpoint" TEXT,
  "lastMeaningfulSyncAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramCrmConversation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TelegramCrmConversation_unreadCount_check" CHECK ("unreadCount" >= 0)
);

CREATE UNIQUE INDEX "TelegramCrmConversation_workspaceId_peer_account_key"
  ON "TelegramCrmConversation"("workspaceId", "telegramCrmPeerId", "mtprotoAccountId");
CREATE UNIQUE INDEX "TelegramCrmConversation_id_workspaceId_key"
  ON "TelegramCrmConversation"("id", "workspaceId");
CREATE UNIQUE INDEX "TelegramCrmConversation_id_workspaceId_account_key"
  ON "TelegramCrmConversation"("id", "workspaceId", "mtprotoAccountId");
CREATE INDEX "TelegramCrmConversation_workspace_state_lastMessage_id_idx"
  ON "TelegramCrmConversation"("workspaceId", "state", "lastMessageAt", "id");
CREATE INDEX "TelegramCrmConversation_workspace_contact_lastMessage_id_idx"
  ON "TelegramCrmConversation"("workspaceId", "contactId", "lastMessageAt", "id");
CREATE INDEX "TelegramCrmConversation_workspace_account_lastMessage_id_idx"
  ON "TelegramCrmConversation"("workspaceId", "mtprotoAccountId", "lastMessageAt", "id");

CREATE TABLE "TelegramCrmAccountSyncState" (
  "mtprotoAccountId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "initialImportStatus" "TelegramCrmInitialImportStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "incrementalCheckpoint" TEXT,
  "recoveryCheckpoint" TEXT,
  "status" "TelegramCrmSyncStatus" NOT NULL DEFAULT 'IDLE',
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "lastMeaningfulSyncAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramCrmAccountSyncState_pkey" PRIMARY KEY ("mtprotoAccountId")
);

CREATE UNIQUE INDEX "TelegramCrmAccountSyncState_account_workspace_key"
  ON "TelegramCrmAccountSyncState"("mtprotoAccountId", "workspaceId");

CREATE TABLE "TelegramCrmCustomerAutomationExecution" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "automationType" "TelegramCrmCustomerAutomationType" NOT NULL,
  "contactId" TEXT NOT NULL,
  "telegramAdSaleId" TEXT,
  "placementId" TEXT,
  "eventKey" TEXT NOT NULL,
  "eventOccurredAt" TIMESTAMP(3) NOT NULL,
  "status" "TelegramCrmCustomerAutomationExecutionStatus" NOT NULL DEFAULT 'PENDING',
  "attemptedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramCrmCustomerAutomationExecution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramCrmCustomerAutomationExecution_event_key"
  ON "TelegramCrmCustomerAutomationExecution"("workspaceId", "automationType", "eventKey");
CREATE UNIQUE INDEX "TelegramCrmCustomerAutomationExecution_id_workspaceId_key"
  ON "TelegramCrmCustomerAutomationExecution"("id", "workspaceId");
CREATE INDEX "TelegramCrmCustomerAutomationExecution_workspace_created_id_idx"
  ON "TelegramCrmCustomerAutomationExecution"("workspaceId", "createdAt", "id");

CREATE TABLE "TelegramCrmMessage" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "telegramMessageId" TEXT NOT NULL,
  "mtprotoAccountId" TEXT NOT NULL,
  "direction" "TelegramCrmMessageDirection" NOT NULL,
  "origin" "TelegramCrmMessageOrigin" NOT NULL,
  "sentByMemberId" TEXT,
  "automationExecutionId" TEXT,
  "text" TEXT,
  "contentMetadata" JSONB,
  "sentAt" TIMESTAMP(3) NOT NULL,
  "editedAt" TIMESTAMP(3),
  "readState" "TelegramCrmReadState" NOT NULL DEFAULT 'UNKNOWN',
  "deliveryState" "TelegramCrmDeliveryState" NOT NULL DEFAULT 'UNKNOWN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramCrmMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramCrmMessage_automationExecution_workspace_key"
  ON "TelegramCrmMessage"("automationExecutionId", "workspaceId");
CREATE UNIQUE INDEX "TelegramCrmMessage_conversation_telegramMessage_key"
  ON "TelegramCrmMessage"("conversationId", "telegramMessageId");
CREATE INDEX "TelegramCrmMessage_conversation_sentAt_id_idx"
  ON "TelegramCrmMessage"("conversationId", "sentAt", "id");

ALTER TABLE "TelegramCrmPeer"
  ADD CONSTRAINT "TelegramCrmPeer_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TelegramCrmPeer_contact_workspace_fkey"
  FOREIGN KEY ("contactId", "workspaceId")
  REFERENCES "TelegramAdvertiser"("id", "workspaceId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TelegramCrmConversation"
  ADD CONSTRAINT "TelegramCrmConversation_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TelegramCrmConversation_peer_workspace_fkey"
  FOREIGN KEY ("telegramCrmPeerId", "workspaceId")
  REFERENCES "TelegramCrmPeer"("id", "workspaceId")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TelegramCrmConversation_contact_workspace_fkey"
  FOREIGN KEY ("contactId", "workspaceId")
  REFERENCES "TelegramAdvertiser"("id", "workspaceId")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TelegramCrmConversation_account_workspace_fkey"
  FOREIGN KEY ("mtprotoAccountId", "workspaceId")
  REFERENCES "TelegramUserAccountIntegration"("id", "workspaceId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TelegramCrmAccountSyncState"
  ADD CONSTRAINT "TelegramCrmAccountSyncState_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TelegramCrmAccountSyncState_account_workspace_fkey"
  FOREIGN KEY ("mtprotoAccountId", "workspaceId")
  REFERENCES "TelegramUserAccountIntegration"("id", "workspaceId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramCrmCustomerAutomationExecution"
  ADD CONSTRAINT "TelegramCrmCustomerAutomationExecution_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TelegramCrmCustomerAutomationExecution_contact_workspace_fkey"
  FOREIGN KEY ("contactId", "workspaceId")
  REFERENCES "TelegramAdvertiser"("id", "workspaceId")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TelegramCrmCustomerAutomationExecution_saleId_fkey"
  FOREIGN KEY ("telegramAdSaleId", "workspaceId")
  REFERENCES "TelegramAdSale"("id", "workspaceId")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TelegramCrmCustomerAutomationExecution_placementId_fkey"
  FOREIGN KEY ("placementId", "workspaceId")
  REFERENCES "TelegramAdSalePlacement"("id", "workspaceId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TelegramCrmMessage"
  ADD CONSTRAINT "TelegramCrmMessage_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TelegramCrmMessage_conversation_workspace_account_fkey"
  FOREIGN KEY ("conversationId", "workspaceId", "mtprotoAccountId")
  REFERENCES "TelegramCrmConversation"("id", "workspaceId", "mtprotoAccountId")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TelegramCrmMessage_sentByMemberId_fkey"
  FOREIGN KEY ("sentByMemberId") REFERENCES "WorkspaceMember"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "TelegramCrmMessage_automationExecution_workspace_fkey"
  FOREIGN KEY ("automationExecutionId", "workspaceId")
  REFERENCES "TelegramCrmCustomerAutomationExecution"("id", "workspaceId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TelegramAdCrmWorkspaceSettings"
  ADD CONSTRAINT "TelegramAdCrmWorkspaceSettings_defaultSender_fkey"
  FOREIGN KEY ("defaultCrmSenderAccountId", "workspaceId")
  REFERENCES "TelegramUserAccountIntegration"("id", "workspaceId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX "TelegramAdvertiser_workspaceId_displayName_key";
DROP INDEX "TelegramAdvertiser_workspaceId_status_updatedAt_idx";
DROP INDEX "TelegramAdvertiser_workspaceId_lifecycleStage_updatedAt_idx";

CREATE INDEX "TelegramAdvertiser_workspaceId_stage_updatedAt_id_idx"
  ON "TelegramAdvertiser"("workspaceId", "stage", "updatedAt", "id");

ALTER TABLE "TelegramAdvertiser"
  DROP COLUMN "telegramUserId",
  DROP COLUMN "status",
  DROP COLUMN "lifecycleStage";
