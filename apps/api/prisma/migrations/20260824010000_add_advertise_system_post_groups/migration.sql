-- Canonicalize one existing user-created advertise group per channel while
-- preserving its content, icon, description, ordering and post membership.
UPDATE "PostGroup"
SET
  "title" = 'advertise',
  "isSystem" = true,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "systemKey" = 'ADVERTISE';

WITH "advertiseCandidates" AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "telegramChannelId"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS "candidateRank"
  FROM "PostGroup"
  WHERE
    "systemKey" IS NULL
    AND LOWER(BTRIM("title")) = 'advertise'
),
"canonicalCandidates" AS (
  SELECT candidate."id"
  FROM "advertiseCandidates" candidate
  JOIN "PostGroup" group_row ON group_row."id" = candidate."id"
  WHERE
    candidate."candidateRank" = 1
    AND NOT EXISTS (
      SELECT 1
      FROM "PostGroup" existing_system
      WHERE
        existing_system."telegramChannelId" = group_row."telegramChannelId"
        AND existing_system."systemKey" = 'ADVERTISE'
    )
)
UPDATE "PostGroup" group_row
SET
  "title" = 'advertise',
  "isSystem" = true,
  "systemKey" = 'ADVERTISE',
  "updatedAt" = CURRENT_TIMESTAMP
FROM "canonicalCandidates" candidate
WHERE group_row."id" = candidate."id";

-- PostGroup has a required workspace-scoped creator relation. Prefer the
-- channel assignee only when it is still valid in the channel workspace;
-- otherwise use the workspace's oldest member.
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
  'system-advertise-' || MD5(channel_row."id"),
  channel_row."workspaceId",
  channel_row."id",
  'advertise',
  true,
  'ADVERTISE',
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
    AND existing_system."systemKey" = 'ADVERTISE'
);
