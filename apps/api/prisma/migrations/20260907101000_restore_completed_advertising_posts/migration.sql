-- Restore only advertising posts whose completed placement proves that the post
-- was published and subsequently deleted by the automatic expiry workflow.
UPDATE "TelegramManagedPost" AS post
SET
  "status" = 'PUBLISHED',
  "telegramRemoteStatus" = 'AUTO_DELETED',
  "scheduledAt" = NULL,
  "publishedAt" = COALESCE(post."publishedAt", evidence."publishedAt"),
  "lastError" = NULL,
  "lastTelegramSyncNote" = 'Advertising placement was published and then automatically deleted after format expiry.'
FROM (
  SELECT
    placement."managedPostId",
    MIN(placement."publishedAt") AS "publishedAt"
  FROM "TelegramAdSalePlacement" AS placement
  WHERE
    placement."status" = 'COMPLETED'
    AND placement."managedPostId" IS NOT NULL
    AND placement."publishedAt" IS NOT NULL
    AND placement."deletedAt" IS NOT NULL
  GROUP BY placement."managedPostId"
) AS evidence
INNER JOIN "PostGroup" AS post_group
  ON post_group."systemKey" = 'ADVERTISE' AND post_group."isSystem" = TRUE
WHERE
  post."id" = evidence."managedPostId"
  AND post."groupId" = post_group."id"
  AND (
    post."status" = 'DRAFT'
    OR (
      post."status" = 'PUBLISHED'
      AND post."telegramRemoteStatus" IN ('MISSING', 'BROKEN')
    )
  );
