-- Persist compact reply-attention facts so CRM collection reads do not count
-- Message rows per Contact. The migration performs one grouped Message scan,
-- creates no runtime work, and leaves Conversations without Messages at zero.

ALTER TABLE "TelegramAdvertiser"
  ADD COLUMN "replyAlertMutedAt" TIMESTAMP(3);

ALTER TABLE "TelegramCrmConversation"
  ADD COLUMN "inboundMessageCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "outboundMessageCount" INTEGER NOT NULL DEFAULT 0;

WITH "messageCounts" AS (
  SELECT
    "conversationId",
    (COUNT(*) FILTER (WHERE "direction" = 'INBOUND'))::INTEGER AS "inboundMessageCount",
    (COUNT(*) FILTER (WHERE "direction" = 'OUTBOUND'))::INTEGER AS "outboundMessageCount"
  FROM "TelegramCrmMessage"
  GROUP BY "conversationId"
)
UPDATE "TelegramCrmConversation" AS conversation
SET
  "inboundMessageCount" = counts."inboundMessageCount",
  "outboundMessageCount" = counts."outboundMessageCount"
FROM "messageCounts" AS counts
WHERE conversation."id" = counts."conversationId";

