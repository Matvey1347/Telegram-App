-- Paid-only folders do not publish or collect a tracking period. They are
-- complete as soon as their finance records are created.
UPDATE "MutualPromotionFolder" AS folder
SET
  "status" = 'COMPLETED',
  "completedAt" = COALESCE(folder."completedAt", folder."createdAt"),
  "nextDueAt" = NULL
WHERE folder."status" = 'DRAFT'
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
