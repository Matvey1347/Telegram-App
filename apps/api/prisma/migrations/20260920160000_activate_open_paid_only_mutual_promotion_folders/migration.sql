-- A paid-only folder has no publication activation step. While its configured
-- period is still open, present it as active rather than draft/completed.
UPDATE "MutualPromotionFolder" AS folder
SET
  "status" = 'ACTIVE',
  "activatedAt" = COALESCE(folder."activatedAt", folder."createdAt"),
  "completedAt" = NULL,
  "nextDueAt" = folder."endsAt"
WHERE folder."endsAt" > NOW()
  AND folder."status" IN ('DRAFT', 'COMPLETED')
  AND EXISTS (
    SELECT 1
    FROM "MutualPromotionFolderParticipant" AS participant
    WHERE participant."folderId" = folder.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "MutualPromotionFolderParticipant" AS publisher
    WHERE publisher."folderId" = folder.id
      AND publisher."role" = 'PUBLISHER'
  );
