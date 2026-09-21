-- Future paid-only folders created before scheduled lifecycle support were
-- incorrectly marked ACTIVE. Return them to SCHEDULED and restore the two
-- lifecycle boundaries needed to capture the start and finish counters.
WITH corrected AS (
  UPDATE "MutualPromotionFolder" folder
  SET "status" = 'SCHEDULED',
      "activatedAt" = NULL,
      "nextDueAt" = folder."startsAt"
  WHERE folder."status" = 'ACTIVE'
    AND folder."startsAt" > CURRENT_TIMESTAMP
    AND NOT EXISTS (
      SELECT 1
      FROM "MutualPromotionFolderParticipant" participant
      WHERE participant."folderId" = folder."id"
        AND participant."role" = 'PUBLISHER'
    )
  RETURNING folder."id", folder."workspaceId", folder."startsAt", folder."endsAt"
)
INSERT INTO "MutualPromotionWorkItem" (
  "id", "workspaceId", "folderId", "kind", "status", "idempotencyKey",
  "dueAt", "nextAttemptAt", "attemptCount", "maxAttempts", "createdAt", "updatedAt"
)
SELECT
  'backfill-' || corrected."id" || '-start', corrected."workspaceId", corrected."id",
  'CAPTURE_START_BASELINE', 'PENDING', 'mutual-promotion:' || corrected."id" || ':start',
  corrected."startsAt", corrected."startsAt", 0, 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM corrected
ON CONFLICT ("idempotencyKey") DO NOTHING;

WITH corrected AS (
  SELECT folder."id", folder."workspaceId", folder."endsAt"
  FROM "MutualPromotionFolder" folder
  WHERE folder."status" = 'SCHEDULED'
    AND folder."startsAt" > CURRENT_TIMESTAMP
    AND NOT EXISTS (
      SELECT 1
      FROM "MutualPromotionFolderParticipant" participant
      WHERE participant."folderId" = folder."id"
        AND participant."role" = 'PUBLISHER'
    )
)
INSERT INTO "MutualPromotionWorkItem" (
  "id", "workspaceId", "folderId", "kind", "status", "idempotencyKey",
  "dueAt", "nextAttemptAt", "attemptCount", "maxAttempts", "createdAt", "updatedAt"
)
SELECT
  'backfill-' || corrected."id" || '-finish', corrected."workspaceId", corrected."id",
  'FINISH_FOLDER', 'PENDING', 'mutual-promotion:' || corrected."id" || ':finish',
  corrected."endsAt", corrected."endsAt", 0, 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM corrected
ON CONFLICT ("idempotencyKey") DO NOTHING;
