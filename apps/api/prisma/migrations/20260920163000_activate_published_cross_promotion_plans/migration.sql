-- A VP becomes active as soon as any of its scheduled managed posts is
-- actually published. Older plans previously stayed Scheduled until deletion.
UPDATE "CrossPromotionPlan" AS plan
SET "status" = 'ACTIVE'
WHERE plan."status" = 'SCHEDULED'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(plan."placementPostIds") AS placement
    JOIN "TelegramManagedPost" AS post
      ON post.id = placement->>'managedPostId'
    WHERE post."status" = 'PUBLISHED'
  );
