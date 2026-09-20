ALTER TABLE "TelegramManagedPost"
  ADD COLUMN "deleteAfterHours" INTEGER,
  ADD COLUMN "deleteAt" TIMESTAMP(3);

CREATE INDEX "TelegramManagedPost_status_deleteAt_idx"
  ON "TelegramManagedPost"("status", "deleteAt");

-- Ad-sale placements already own a deletion snapshot. Mirror that value onto
-- their managed post so the regular editor displays the established lifetime.
UPDATE "TelegramManagedPost" AS post
SET "deleteAfterHours" = placement."deleteAfterHoursSnapshot"
FROM "TelegramAdSalePlacement" AS placement
WHERE placement."managedPostId" = post.id
  AND post."deleteAfterHours" IS NULL
  AND placement."deleteAfterHoursSnapshot" IS NOT NULL;

-- Cross-promotion stores the lifetime per channel in its placement JSON.
-- Copy the existing configured 24/48/72-hour duration to its managed post so
-- the standard post editor and deletion lifecycle have one visible value.
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
