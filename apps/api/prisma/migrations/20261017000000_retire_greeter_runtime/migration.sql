-- Greeter product retirement is intentionally non-destructive. Historical
-- Greeter tables, enum values, and records remain until a separately approved
-- data-retention/drop plan exists.
--
-- Cancel only delivery work that belongs to a Greeter integration or to a
-- Greeter relation. TelegramBotDelivery has one generic SEND_MESSAGE type, so
-- relation checks are required to keep retired queued messages from sending.
UPDATE "TelegramBotDelivery" AS "delivery"
SET
  "status" = 'CANCELLED'::"TelegramBotDeliveryStatus",
  "lockedAt" = NULL,
  "lockedUntil" = NULL,
  "lastError" = COALESCE(
    "lastError",
    'Cancelled because the Greeter product runtime was retired.'
  ),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IN (
  'PENDING'::"TelegramBotDeliveryStatus",
  'PROCESSING'::"TelegramBotDeliveryStatus",
  'RETRY'::"TelegramBotDeliveryStatus"
)
AND (
  EXISTS (
    SELECT 1
    FROM "TelegramBotIntegration" AS "integration"
    WHERE "integration"."id" = "delivery"."botIntegrationId"
      AND "integration"."applicationType" = 'GREETER'::"TelegramBotApplicationType"
  )
  OR EXISTS (
    SELECT 1
    FROM "GreeterSequenceStepExecution" AS "execution"
    WHERE "execution"."deliveryId" = "delivery"."id"
  )
  OR EXISTS (
    SELECT 1
    FROM "GreeterBroadcastRecipient" AS "recipient"
    WHERE "recipient"."deliveryId" = "delivery"."id"
  )
  OR EXISTS (
    SELECT 1
    FROM "GreeterJoinRequest" AS "request"
    WHERE "request"."captchaDeliveryId" = "delivery"."id"
       OR "request"."outcomeDeliveryId" = "delivery"."id"
  )
);

-- Keep the connection/history rows, but make retired Greeter bots unreachable
-- to the application registry and webhook dispatcher.
UPDATE "TelegramBotIntegration"
SET
  "applicationType" = 'NONE'::"TelegramBotApplicationType",
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "applicationType" = 'GREETER'::"TelegramBotApplicationType";

-- Preserve task configuration and history for audit/rollback analysis while
-- disarming tasks that no longer have an executor in the deployed runtime.
UPDATE "ScheduledTaskConfig"
SET
  "enabled" = FALSE,
  "nextScheduledRunAt" = NULL,
  "scheduledClaimOwner" = NULL,
  "scheduledClaimExpiresAt" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "taskKey" IN (
  'greeter.expire_pending',
  'greeter.broadcasts.dispatch',
  'greeter.automations.repair'
);
