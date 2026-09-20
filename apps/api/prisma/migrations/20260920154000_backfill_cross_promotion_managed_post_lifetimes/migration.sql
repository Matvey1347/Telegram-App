-- The original managed-post lifetime migration may already be deployed before
-- cross-promotion started mirroring its placement lifetime to managed posts.
-- Backfill existing VP placements independently and idempotently.
WITH cross_promotion_lifetimes AS (
  SELECT
    placement->>'managedPostId' AS "managedPostId",
    ROUND(
      EXTRACT(
        EPOCH FROM (
          (publisher->>'deleteAt')::timestamptz -
          (publisher->>'scheduledAt')::timestamptz
        )
      ) / 3600
    )::integer AS "deleteAfterHours"
  FROM "CrossPromotionPlan" AS plan
  CROSS JOIN LATERAL jsonb_array_elements(plan."placementPostIds") AS placement
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(plan."publicationPost"->'publisherPlacements', '[]'::jsonb)
  ) AS publisher
  WHERE placement->>'telegramChannelId' = publisher->>'telegramChannelId'
    AND publisher->>'deleteAt' IS NOT NULL
)
UPDATE "TelegramManagedPost" AS post
SET "deleteAfterHours" = lifetime."deleteAfterHours"
FROM cross_promotion_lifetimes AS lifetime
WHERE post.id = lifetime."managedPostId"
  AND post."deleteAfterHours" IS NULL
  AND lifetime."deleteAfterHours" IN (24, 48, 72);
