UPDATE "MutualPromotionFolder" AS folder
SET "startsAt" = posts."startsAt"
FROM (
  SELECT "folderId", MIN("scheduledAt") AS "startsAt"
  FROM "MutualPromotionFolderPost"
  GROUP BY "folderId"
) AS posts
WHERE folder."id" = posts."folderId";

ALTER TABLE "MutualPromotionFolder"
  ALTER COLUMN "startsAt" DROP NOT NULL,
  DROP COLUMN "timezone";
