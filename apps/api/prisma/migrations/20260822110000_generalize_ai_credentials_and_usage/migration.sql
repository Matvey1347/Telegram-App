ALTER TABLE "FinanceAiProviderConfig" DROP COLUMN "model";

ALTER TABLE "FinanceAiUsage"
  ALTER COLUMN "profileId" DROP NOT NULL,
  ADD COLUMN "workspaceId" TEXT,
  ADD COLUMN "botIntegrationId" TEXT,
  ADD COLUMN "runtimeInstanceId" TEXT,
  ADD COLUMN "telegramBotUserId" TEXT,
  ADD COLUMN "cachedInputTokens" INTEGER,
  ADD COLUMN "inputAudioTokens" INTEGER,
  ADD COLUMN "outputAudioTokens" INTEGER,
  ADD COLUMN "inputPriceMicrosPerMillion" INTEGER,
  ADD COLUMN "cachedInputPriceMicrosPerMillion" INTEGER,
  ADD COLUMN "outputPriceMicrosPerMillion" INTEGER,
  ADD COLUMN "pricingVersion" TEXT;

UPDATE "FinanceAiUsage" usage
SET
  "workspaceId" = bot."workspaceId",
  "botIntegrationId" = profile."botIntegrationId",
  "telegramBotUserId" = profile."telegramBotUserId",
  "runtimeInstanceId" = bot_user."runtimeInstanceId"
FROM "FinanceProfile" profile
JOIN "TelegramBotIntegration" bot ON bot.id = profile."botIntegrationId"
LEFT JOIN "TelegramBotUser" bot_user ON bot_user.id = profile."telegramBotUserId"
WHERE usage."profileId" = profile.id;

CREATE INDEX "FinanceAiUsage_workspace_bot_runtime_created_idx"
  ON "FinanceAiUsage"("workspaceId", "botIntegrationId", "runtimeInstanceId", "createdAt");
CREATE INDEX "FinanceAiUsage_user_created_idx"
  ON "FinanceAiUsage"("telegramBotUserId", "createdAt");
