UPDATE "MutualPromotionFolder" AS folder
SET "startsAt" = COALESCE(
  (
    SELECT MIN(post."scheduledAt")
    FROM "MutualPromotionFolderPost" AS post
    WHERE post."folderId" = folder."id"
  ),
  LEAST(folder."createdAt", folder."endsAt" - INTERVAL '1 minute')
)
WHERE folder."startsAt" IS NULL;

ALTER TABLE "MutualPromotionFolder"
  ALTER COLUMN "startsAt" SET NOT NULL;
