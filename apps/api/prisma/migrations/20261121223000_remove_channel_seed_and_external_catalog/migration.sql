BEGIN;

CREATE TEMP TABLE external_channel_ids ON COMMIT DROP AS
SELECT channel.id
FROM "TelegramChannel" AS channel
WHERE NOT EXISTS (
  SELECT 1
  FROM "TelegramChannelAdminLink" AS admin
  WHERE admin."telegramChannelId" = channel.id
    AND admin."workspaceId" = channel."workspaceId"
);

-- Keep accepted publication deadlines intact if this migration is applied
-- to a database with a different set of external channels.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "TelegramManagedPost" AS post
    JOIN external_channel_ids AS external ON post."telegramChannelId" = external.id
    WHERE post.status::text IN ('SCHEDULED', 'PUBLISHING')
  ) OR EXISTS (
    SELECT 1 FROM "TelegramAdSalePlacement" AS placement
    JOIN external_channel_ids AS external ON placement."telegramChannelId" = external.id
    WHERE placement.status::text IN ('RESERVED', 'SCHEDULED', 'PUBLISHING')
  ) THEN
    RAISE EXCEPTION 'External channels still have active publication commitments';
  END IF;
END
$$;

DELETE FROM "MutualPromotionPostDelivery"
WHERE "telegramChannelId" IN (SELECT id FROM external_channel_ids);

DELETE FROM "MutualPromotionFolderParticipant"
WHERE "telegramChannelId" IN (SELECT id FROM external_channel_ids);

DELETE FROM "TelegramChannel"
WHERE id IN (SELECT id FROM external_channel_ids);

ALTER TABLE "TelegramChannel"
  DROP COLUMN "seedSubscribersCount",
  DROP COLUMN "seedDisabled";

COMMIT;
