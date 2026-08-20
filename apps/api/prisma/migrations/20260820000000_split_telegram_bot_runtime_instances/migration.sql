-- Separate logical Telegram bot business configuration from environment-specific
-- BotFather credentials and webhook state. Every existing integration represents
-- the production bot, so it is backfilled as a PRODUCTION runtime before the old
-- columns are removed.
CREATE TYPE "TelegramBotRuntimeEnvironment" AS ENUM ('LOCAL', 'PRODUCTION');

CREATE TABLE "TelegramBotRuntimeInstance" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "botIntegrationId" TEXT NOT NULL,
    "environment" "TelegramBotRuntimeEnvironment" NOT NULL,
    "botTokenEncrypted" TEXT NOT NULL,
    "botTokenIv" TEXT NOT NULL,
    "botTokenAuthTag" TEXT NOT NULL,
    "botTokenMasked" TEXT NOT NULL,
    "botId" TEXT,
    "username" TEXT,
    "firstName" TEXT,
    "lastErrorMessage" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "runtimeStatus" "TelegramBotRuntimeStatus" NOT NULL DEFAULT 'DISABLED',
    "webhookStatus" "TelegramBotWebhookStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "webhookUrl" TEXT,
    "webhookSecretEncrypted" TEXT,
    "webhookSecretIv" TEXT,
    "webhookSecretAuthTag" TEXT,
    "webhookConfiguredAt" TIMESTAMP(3),
    "pendingWebhookUrl" TEXT,
    "pendingWebhookSecretEncrypted" TEXT,
    "pendingWebhookSecretIv" TEXT,
    "pendingWebhookSecretAuthTag" TEXT,
    "runtimeTransitionStartedAt" TIMESTAMP(3),
    "lastUpdateProcessedAt" TIMESTAMP(3),
    "lastRuntimeError" TEXT,
    "webAppStatus" TEXT,
    "webAppUrl" TEXT,
    "webAppError" TEXT,
    "miniAppStatus" TEXT,
    "miniAppExpectedUrl" TEXT,
    "miniAppActualUrl" TEXT,
    "miniAppError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramBotRuntimeInstance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramBotRuntimeInstance_botIntegrationId_environment_key"
ON "TelegramBotRuntimeInstance"("botIntegrationId", "environment");

CREATE UNIQUE INDEX "TelegramBotRuntimeInstance_id_workspaceId_botIntegrationId_key"
ON "TelegramBotRuntimeInstance"("id", "workspaceId", "botIntegrationId");

CREATE INDEX "TelegramBotRuntimeInstance_workspaceId_botIntegrationId_idx"
ON "TelegramBotRuntimeInstance"("workspaceId", "botIntegrationId");

CREATE INDEX "TelegramBotRuntimeInstance_environment_runtimeStatus_idx"
ON "TelegramBotRuntimeInstance"("environment", "runtimeStatus");

ALTER TABLE "TelegramBotRuntimeInstance"
ADD CONSTRAINT "TelegramBotRuntimeInstance_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramBotRuntimeInstance"
ADD CONSTRAINT "TelegramBotRuntimeInstance_bot_workspace_fkey"
FOREIGN KEY ("botIntegrationId", "workspaceId")
REFERENCES "TelegramBotIntegration"("id", "workspaceId")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Application type is authoritative on the logical bot after this migration.
-- Preserve the intended target of any transition that was in flight when the
-- migration started before removing the old runtime staging field.
UPDATE "TelegramBotIntegration"
SET "applicationType" = "pendingApplicationType"
WHERE "pendingApplicationType" IS NOT NULL;

INSERT INTO "TelegramBotRuntimeInstance" (
    "id",
    "workspaceId",
    "botIntegrationId",
    "environment",
    "botTokenEncrypted",
    "botTokenIv",
    "botTokenAuthTag",
    "botTokenMasked",
    "botId",
    "username",
    "firstName",
    "lastErrorMessage",
    "lastCheckedAt",
    "runtimeStatus",
    "webhookStatus",
    "webhookUrl",
    "webhookSecretEncrypted",
    "webhookSecretIv",
    "webhookSecretAuthTag",
    "webhookConfiguredAt",
    "pendingWebhookUrl",
    "pendingWebhookSecretEncrypted",
    "pendingWebhookSecretIv",
    "pendingWebhookSecretAuthTag",
    "runtimeTransitionStartedAt",
    "lastUpdateProcessedAt",
    "lastRuntimeError",
    "createdAt",
    "updatedAt"
)
SELECT
    'prod_' || "id",
    "workspaceId",
    "id",
    'PRODUCTION'::"TelegramBotRuntimeEnvironment",
    "botTokenEncrypted",
    "botTokenIv",
    "botTokenAuthTag",
    "botTokenMasked",
    "botId",
    "username",
    "firstName",
    "lastErrorMessage",
    "lastCheckedAt",
    "runtimeStatus",
    "webhookStatus",
    "webhookUrl",
    "webhookSecretEncrypted",
    "webhookSecretIv",
    "webhookSecretAuthTag",
    "webhookConfiguredAt",
    "pendingWebhookUrl",
    "pendingWebhookSecretEncrypted",
    "pendingWebhookSecretIv",
    "pendingWebhookSecretAuthTag",
    "runtimeTransitionStartedAt",
    "lastUpdateProcessedAt",
    "lastRuntimeError",
    "createdAt",
    "updatedAt"
FROM "TelegramBotIntegration";

ALTER TABLE "TelegramBotUpdateLog"
ADD COLUMN "runtimeInstanceId" TEXT;

UPDATE "TelegramBotUpdateLog" AS update_log
SET "runtimeInstanceId" = runtime."id"
FROM "TelegramBotRuntimeInstance" AS runtime
WHERE runtime."botIntegrationId" = update_log."botIntegrationId"
  AND runtime."workspaceId" = update_log."workspaceId"
  AND runtime."environment" = 'PRODUCTION';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "TelegramBotUpdateLog"
    WHERE "runtimeInstanceId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Unable to map every Telegram bot update log to a production runtime';
  END IF;
END $$;

ALTER TABLE "TelegramBotUpdateLog"
ALTER COLUMN "runtimeInstanceId" SET NOT NULL;

DROP INDEX "TelegramBotUpdateLog_botIntegrationId_updateId_key";
DROP INDEX "TelegramBotUpdateLog_workspaceId_botIntegrationId_receivedAt_id";

CREATE UNIQUE INDEX "TelegramBotUpdateLog_runtimeInstanceId_updateId_key"
ON "TelegramBotUpdateLog"("runtimeInstanceId", "updateId");

CREATE INDEX "TelegramBotUpdateLog_workspace_runtime_received_idx"
ON "TelegramBotUpdateLog"("workspaceId", "runtimeInstanceId", "receivedAt");

ALTER TABLE "TelegramBotUpdateLog"
ADD CONSTRAINT "TelegramBotUpdateLog_runtime_workspace_bot_fkey"
FOREIGN KEY ("runtimeInstanceId", "workspaceId", "botIntegrationId")
REFERENCES "TelegramBotRuntimeInstance"("id", "workspaceId", "botIntegrationId")
ON DELETE CASCADE ON UPDATE CASCADE;

-- An immediate interaction can pin a delivery to its origin runtime. Existing
-- and future scheduled/background deliveries remain unpinned and resolve the
-- authoritative PRODUCTION runtime at send time.
ALTER TABLE "TelegramBotDelivery"
ADD COLUMN "runtimeInstanceId" TEXT;

CREATE INDEX "TelegramBotDelivery_runtimeInstanceId_idx"
ON "TelegramBotDelivery"("runtimeInstanceId");

ALTER TABLE "TelegramBotDelivery"
ADD CONSTRAINT "TelegramBotDelivery_runtimeInstanceId_fkey"
FOREIGN KEY ("runtimeInstanceId") REFERENCES "TelegramBotRuntimeInstance"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX "TelegramBotIntegration_runtimeStatus_idx";

ALTER TABLE "TelegramBotIntegration"
DROP COLUMN "botTokenEncrypted",
DROP COLUMN "botTokenIv",
DROP COLUMN "botTokenAuthTag",
DROP COLUMN "botTokenMasked",
DROP COLUMN "botId",
DROP COLUMN "username",
DROP COLUMN "firstName",
DROP COLUMN "lastErrorMessage",
DROP COLUMN "lastCheckedAt",
DROP COLUMN "runtimeStatus",
DROP COLUMN "webhookStatus",
DROP COLUMN "webhookUrl",
DROP COLUMN "webhookSecretEncrypted",
DROP COLUMN "webhookSecretIv",
DROP COLUMN "webhookSecretAuthTag",
DROP COLUMN "webhookConfiguredAt",
DROP COLUMN "pendingApplicationType",
DROP COLUMN "pendingWebhookUrl",
DROP COLUMN "pendingWebhookSecretEncrypted",
DROP COLUMN "pendingWebhookSecretIv",
DROP COLUMN "pendingWebhookSecretAuthTag",
DROP COLUMN "runtimeTransitionStartedAt",
DROP COLUMN "lastUpdateProcessedAt",
DROP COLUMN "lastRuntimeError";

-- System Bot is a separate integration, but LOCAL and PRODUCTION also use
-- separate BotFather identities against the same database. Scope idempotency
-- by its selected runtime environment so their Telegram update IDs cannot
-- collide.
ALTER TABLE "TelegramSystemBotUpdateLog"
ADD COLUMN "environment" "TelegramBotRuntimeEnvironment" NOT NULL DEFAULT 'PRODUCTION';

DROP INDEX "TelegramSystemBotUpdateLog_updateId_key";

CREATE UNIQUE INDEX "TelegramSystemBotUpdateLog_environment_updateId_key"
ON "TelegramSystemBotUpdateLog"("environment", "updateId");
