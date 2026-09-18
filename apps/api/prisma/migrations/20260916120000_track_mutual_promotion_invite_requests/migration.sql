ALTER TABLE "MutualPromotionFolderParticipant"
ADD COLUMN "inviteRequestedAtStart" INTEGER,
ADD COLUMN "inviteRequestedAtEnd" INTEGER;

UPDATE "MutualPromotionFolderParticipant" participant
SET "inviteRequestedAtStart" = COALESCE(
  (
    SELECT snapshot."requestedCount"
    FROM "TelegramInviteLinkSnapshot" snapshot
    WHERE snapshot."inviteLinkId" = participant."inviteLinkId"
      AND snapshot."syncedAt" <= participant."baselineCapturedAt"
    ORDER BY snapshot."syncedAt" DESC, snapshot."id" DESC
    LIMIT 1
  ),
  invite."requestedCount"
)
FROM "TelegramInviteLink" invite
WHERE participant."inviteLinkId" = invite."id"
  AND participant."baselineCapturedAt" IS NOT NULL;

UPDATE "MutualPromotionFolderParticipant" participant
SET "inviteRequestedAtEnd" = COALESCE(
  (
    SELECT snapshot."requestedCount"
    FROM "TelegramInviteLinkSnapshot" snapshot
    WHERE snapshot."inviteLinkId" = participant."inviteLinkId"
      AND snapshot."syncedAt" <= participant."finalCapturedAt"
    ORDER BY snapshot."syncedAt" DESC, snapshot."id" DESC
    LIMIT 1
  ),
  invite."requestedCount"
)
FROM "TelegramInviteLink" invite
WHERE participant."inviteLinkId" = invite."id"
  AND participant."finalCapturedAt" IS NOT NULL;
