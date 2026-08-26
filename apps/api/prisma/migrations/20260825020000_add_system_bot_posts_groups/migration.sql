UPDATE "PostGroup"
SET
  "title" = 'System Bot posts',
  "isSystem" = true,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "systemKey" = 'SYSTEM_BOT_POSTS';

-- PostGroup requires a creator from the same workspace. Prefer the channel
-- assignee when available, then the oldest workspace member.
INSERT INTO "PostGroup" (
  "id",
  "workspaceId",
  "telegramChannelId",
  "title",
  "isSystem",
  "systemKey",
  "statusNumberingEnabled",
  "createdByMemberId",
  "createdAt",
  "updatedAt"
)
SELECT
  'system-bot-posts-' || MD5(channel_row."id"),
  channel_row."workspaceId",
  channel_row."id",
  'System Bot posts',
  true,
  'SYSTEM_BOT_POSTS',
  false,
  creator."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "TelegramChannel" channel_row
JOIN LATERAL (
  SELECT member."id"
  FROM "WorkspaceMember" member
  WHERE member."workspaceId" = channel_row."workspaceId"
  ORDER BY
    CASE WHEN member."id" = channel_row."assignedMemberId" THEN 0 ELSE 1 END,
    member."createdAt" ASC,
    member."id" ASC
  LIMIT 1
) creator ON true
WHERE NOT EXISTS (
  SELECT 1
  FROM "PostGroup" existing_system
  WHERE
    existing_system."telegramChannelId" = channel_row."id"
    AND existing_system."systemKey" = 'SYSTEM_BOT_POSTS'
);
