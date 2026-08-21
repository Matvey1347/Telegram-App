-- A Local BotFather bot is a separate product runtime. Attribute every new
-- Telegram user (and therefore its finance subscriptions) to that runtime so
-- dashboard metrics cannot blend Local and Production activity.
ALTER TABLE "TelegramBotUser" ADD COLUMN "runtimeInstanceId" TEXT;

-- Historic rows predate per-runtime attribution. They were production data at
-- the time runtime splitting was introduced, so attach them to PRODUCTION when
-- that runtime exists; unmatched legacy rows stay unclassified and are never
-- included in either runtime's metrics.
UPDATE "TelegramBotUser" AS user_row
SET "runtimeInstanceId" = runtime."id"
FROM "TelegramBotRuntimeInstance" AS runtime
WHERE runtime."botIntegrationId" = user_row."botIntegrationId"
  AND runtime."environment" = 'PRODUCTION'::"TelegramBotRuntimeEnvironment";

ALTER TABLE "TelegramBotUser"
  DROP CONSTRAINT IF EXISTS "TelegramBotUser_botIntegrationId_telegramUserId_key";
CREATE UNIQUE INDEX "TelegramBotUser_runtimeInstanceId_telegramUserId_key"
  ON "TelegramBotUser"("runtimeInstanceId", "telegramUserId");
CREATE INDEX "TelegramBotUser_workspaceId_runtimeInstanceId_idx"
  ON "TelegramBotUser"("workspaceId", "runtimeInstanceId");

ALTER TABLE "TelegramBotUser"
  ADD CONSTRAINT "TelegramBotUser_runtimeInstanceId_fkey"
  FOREIGN KEY ("runtimeInstanceId") REFERENCES "TelegramBotRuntimeInstance"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
