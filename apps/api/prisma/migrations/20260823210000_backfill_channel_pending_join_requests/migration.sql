UPDATE "TelegramChannel" AS channel
SET "pendingJoinRequestsCount" = pending.total
FROM (
  SELECT
    "telegramChannelId",
    COALESCE(SUM("requestedCount"), 0)::INTEGER AS total
  FROM "TelegramInviteLink"
  WHERE "isRevoked" = FALSE
  GROUP BY "telegramChannelId"
) AS pending
WHERE channel."id" = pending."telegramChannelId"
  AND channel."pendingJoinRequestsCount" = 0
  AND pending.total > 0;
