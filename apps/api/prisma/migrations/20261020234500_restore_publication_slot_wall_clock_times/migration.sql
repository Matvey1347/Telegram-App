-- Publication slots are recurring local wall-clock times. The previous
-- normalization stored the equivalent UTC clock value, which shifted every
-- slot after a daylight-saving transition. Restore the intended local value
-- using the pre-transition reference date on which that normalization ran.
UPDATE "TelegramPublicationScheduleSlot" AS slot
SET "time" = to_char(
  ((DATE '2026-10-20' + slot."time"::time) AT TIME ZONE 'UTC')
    AT TIME ZONE COALESCE(workspace."timezone", 'UTC'),
  'HH24:MI'
)
FROM "TelegramPublicationSchedule" AS schedule
JOIN "Workspace" AS workspace ON workspace."id" = schedule."workspaceId"
WHERE schedule."id" = slot."scheduleId";
