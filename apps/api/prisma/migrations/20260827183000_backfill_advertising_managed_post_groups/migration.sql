-- Advertising managed posts historically created through the web flow were
-- linked to placements without being assigned to the channel's Advertise
-- system group. Normalize/create that group per affected channel, then move
-- every placement-owned managed post into its own channel group.

UPDATE "PostGroup" candidate
SET
  "title" = 'Advertise',
  "icon" = '💰',
  "isSystem" = TRUE,
  "systemKey" = 'ADVERTISE',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE LOWER(BTRIM(candidate."title")) = 'advertise'
  AND NOT EXISTS (
    SELECT 1
    FROM "PostGroup" keyed
    WHERE keyed."telegramChannelId" = candidate."telegramChannelId"
      AND keyed."systemKey" = 'ADVERTISE'
  );

WITH affected_channels AS (
  SELECT DISTINCT
    post."workspaceId",
    post."telegramChannelId",
    COALESCE(
      channel."assignedMemberId",
      (
        SELECT member.id
        FROM "WorkspaceMember" member
        WHERE member."workspaceId" = post."workspaceId"
        ORDER BY member."createdAt" ASC, member.id ASC
        LIMIT 1
      )
    ) AS "createdByMemberId"
  FROM "TelegramManagedPost" post
  INNER JOIN "TelegramAdSalePlacement" placement
    ON placement."managedPostId" = post.id
  INNER JOIN "TelegramChannel" channel
    ON channel.id = post."telegramChannelId"
)
INSERT INTO "PostGroup" (
  id,
  "workspaceId",
  "telegramChannelId",
  title,
  icon,
  "isSystem",
  "systemKey",
  "createdByMemberId",
  "createdAt",
  "updatedAt"
)
SELECT
  'adgrp_' || MD5(channel."workspaceId" || ':' || channel."telegramChannelId"),
  channel."workspaceId",
  channel."telegramChannelId",
  'Advertise',
  '💰',
  TRUE,
  'ADVERTISE',
  channel."createdByMemberId",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM affected_channels channel
WHERE channel."createdByMemberId" IS NOT NULL
ON CONFLICT ("telegramChannelId", "systemKey") DO UPDATE
SET
  title = EXCLUDED.title,
  icon = EXCLUDED.icon,
  "isSystem" = TRUE,
  "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "TelegramManagedPost" post
SET "groupId" = advertise.id
FROM "TelegramAdSalePlacement" placement
INNER JOIN "PostGroup" advertise
  ON advertise."telegramChannelId" = placement."telegramChannelId"
  AND advertise."systemKey" = 'ADVERTISE'
WHERE placement."managedPostId" = post.id
  AND post."workspaceId" = advertise."workspaceId"
  AND post."telegramChannelId" = advertise."telegramChannelId"
  AND post."groupId" IS DISTINCT FROM advertise.id;

WITH numbered AS (
  SELECT
    post.id,
    ROW_NUMBER() OVER (
      PARTITION BY post."groupId"
      ORDER BY post."createdAt" ASC, post.id ASC
    ) - 1 AS "groupPosition",
    ROW_NUMBER() OVER (
      PARTITION BY post."groupId", post.status
      ORDER BY post."createdAt" ASC, post.id ASC
    ) - 1 AS "statusPosition"
  FROM "TelegramManagedPost" post
  INNER JOIN "PostGroup" advertise ON advertise.id = post."groupId"
  WHERE advertise."systemKey" = 'ADVERTISE'
)
UPDATE "TelegramManagedPost" post
SET
  "groupPosition" = numbered."groupPosition",
  "statusPosition" = numbered."statusPosition"
FROM numbered
WHERE post.id = numbered.id;
