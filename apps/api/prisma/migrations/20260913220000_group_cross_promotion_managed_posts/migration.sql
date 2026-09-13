-- Direct mutual-promotion placements created before the scheduler started using
-- the permanent system group can appear under "No group". Reattach those
-- managed posts to the channel's existing Mutual promotion group.
INSERT INTO "PostGroup" (
  "id",
  "workspaceId",
  "telegramChannelId",
  "title",
  "icon",
  "isSystem",
  "systemKey",
  "statusNumberingEnabled",
  "createdByMemberId",
  "createdAt",
  "updatedAt"
)
SELECT DISTINCT
  'mutual-promotion-' || MD5(channel_row."id"),
  plan."workspaceId",
  channel_row."id",
  'Mutual promotion',
  '🤝',
  TRUE,
  'MUTUAL_PROMOTION',
  FALSE,
  creator."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "CrossPromotionPlan" plan
CROSS JOIN LATERAL jsonb_array_elements(plan."placementPostIds") placement
JOIN "TelegramChannel" channel_row
  ON channel_row."id" = placement ->> 'telegramChannelId'
 AND channel_row."workspaceId" = plan."workspaceId"
JOIN LATERAL (
  SELECT member."id"
  FROM "WorkspaceMember" member
  WHERE member."workspaceId" = plan."workspaceId"
  ORDER BY
    CASE WHEN member."id" = channel_row."assignedMemberId" THEN 0 ELSE 1 END,
    member."createdAt" ASC,
    member."id" ASC
  LIMIT 1
) creator ON TRUE
WHERE plan."kind" = 'DIRECT_MUTUAL'
  AND NOT EXISTS (
    SELECT 1
    FROM "PostGroup" existing_group
    WHERE existing_group."telegramChannelId" = channel_row."id"
      AND existing_group."systemKey" = 'MUTUAL_PROMOTION'
  )
ON CONFLICT ("telegramChannelId", "systemKey") DO NOTHING;

WITH placement_groups AS (
  SELECT DISTINCT
    placement ->> 'managedPostId' AS "managedPostId",
    system_group."id" AS "groupId"
  FROM "CrossPromotionPlan" plan
  CROSS JOIN LATERAL jsonb_array_elements(plan."placementPostIds") placement
  JOIN "PostGroup" system_group
    ON system_group."workspaceId" = plan."workspaceId"
   AND system_group."telegramChannelId" = placement ->> 'telegramChannelId'
   AND system_group."systemKey" = 'MUTUAL_PROMOTION'
  WHERE plan."kind" = 'DIRECT_MUTUAL'
), ranked_placements AS (
  SELECT
    placement_groups."managedPostId",
    placement_groups."groupId",
    ROW_NUMBER() OVER (
      PARTITION BY placement_groups."groupId"
      ORDER BY placement_groups."managedPostId"
    ) - 1 AS "positionOffset"
  FROM placement_groups
), existing_group_sizes AS (
  SELECT "groupId", COUNT(*) AS "postCount"
  FROM "TelegramManagedPost"
  WHERE "groupId" IS NOT NULL
  GROUP BY "groupId"
)
UPDATE "TelegramManagedPost" post
SET
  "groupId" = ranked."groupId",
  "groupPosition" = (
    COALESCE(group_sizes."postCount", 0) + ranked."positionOffset"
  )::INTEGER
FROM ranked_placements ranked
LEFT JOIN existing_group_sizes group_sizes
  ON group_sizes."groupId" = ranked."groupId"
WHERE post."id" = ranked."managedPostId"
  AND post."groupId" IS DISTINCT FROM ranked."groupId";

-- Keep the placement read model consistent with the repaired managed posts.
UPDATE "CrossPromotionPlan" plan
SET "placementPostIds" = (
  SELECT jsonb_agg(
    CASE
      WHEN system_group."id" IS NULL THEN placement
      ELSE jsonb_set(
        placement,
        '{postGroupId}',
        to_jsonb(system_group."id"),
        TRUE
      )
    END
    ORDER BY placement_index
  ) AS "placements"
  FROM jsonb_array_elements(plan."placementPostIds") WITH ORDINALITY
    AS expanded(placement, placement_index)
  LEFT JOIN "PostGroup" system_group
    ON system_group."workspaceId" = plan."workspaceId"
   AND system_group."telegramChannelId" = placement ->> 'telegramChannelId'
   AND system_group."systemKey" = 'MUTUAL_PROMOTION'
)
WHERE plan."kind" = 'DIRECT_MUTUAL'
  AND jsonb_array_length(plan."placementPostIds") > 0;
