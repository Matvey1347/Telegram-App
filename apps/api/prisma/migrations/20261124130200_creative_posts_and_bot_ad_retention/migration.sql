ALTER TABLE "WorkspaceCreative" ADD COLUMN "post" JSONB;

ALTER TABLE "BotAdLink" ADD COLUMN "campaignId" UUID;
CREATE INDEX "BotAdLink_runtimeInstanceId_campaignId_idx"
  ON "BotAdLink"("runtimeInstanceId", "campaignId");
ALTER TABLE "BotAdAttribution" ADD COLUMN "retainedAt" TIMESTAMP(3);

WITH pending AS (
  SELECT "telegramBotUserId", jsonb_object_agg("runtimeInstanceId",
    to_char(CASE WHEN "activatedAt" IS NULL THEN "startedAt"
      ELSE "startedAt" + interval '30 days' END, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) AS milestones
  FROM "BotAdAttribution" GROUP BY "telegramBotUserId"
)
UPDATE "TelegramBotUser" u
SET "pendingAdActivation" = u."pendingAdActivation" || pending.milestones
FROM pending WHERE u."id" = pending."telegramBotUserId";
