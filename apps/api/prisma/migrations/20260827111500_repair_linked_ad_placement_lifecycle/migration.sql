-- Directly linked published posts used to keep the placement in RESERVED with
-- no publication timestamp. Restore their real Telegram lifecycle so overdue
-- deletion can run and the UI no longer reports "Publication pending".
UPDATE "TelegramAdSalePlacement" AS placement
SET
  "publishedAt" = post."postDate",
  "status" = 'PUBLISHED',
  "plannedDeleteAt" = CASE
    WHEN placement."isPermanentSnapshot" = TRUE
      OR placement."deleteAfterHoursSnapshot" IS NULL
      THEN NULL
    ELSE post."postDate"
      + (placement."deleteAfterHoursSnapshot" * INTERVAL '1 hour')
  END
FROM "TelegramPost" AS post
WHERE placement."telegramPostId" = post."id"
  AND placement."publishedAt" IS NULL
  AND placement."deletedAt" IS NULL;

-- A format such as 1/24 expires after exactly 24 hours. Remove the former
-- implicit safety hour from pending deadlines.
UPDATE "TelegramAdSalePlacement"
SET "plannedDeleteAt" = "publishedAt"
  + ("deleteAfterHoursSnapshot" * INTERVAL '1 hour')
WHERE "publishedAt" IS NOT NULL
  AND "deleteAfterHoursSnapshot" IS NOT NULL
  AND "isPermanentSnapshot" = FALSE
  AND "deletedAt" IS NULL
  AND "plannedDeleteAt" IS DISTINCT FROM (
    "publishedAt"
      + ("deleteAfterHoursSnapshot" * INTERVAL '1 hour')
  );
