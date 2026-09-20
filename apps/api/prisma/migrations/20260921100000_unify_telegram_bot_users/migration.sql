-- A logical bot has one user identity in every runtime.  Local runtime users
-- were intentionally disposable test data; production rows remain untouched.
DELETE FROM "TelegramBotUser" AS local_user
USING "TelegramBotRuntimeInstance" AS local_runtime
WHERE local_user."runtimeInstanceId" = local_runtime."id"
  AND local_runtime."environment" = 'LOCAL';

DROP INDEX IF EXISTS "TelegramBotUser_runtimeInstanceId_telegramUserId_key";
CREATE UNIQUE INDEX "TelegramBotUser_botIntegrationId_telegramUserId_key"
  ON "TelegramBotUser"("botIntegrationId", "telegramUserId");
