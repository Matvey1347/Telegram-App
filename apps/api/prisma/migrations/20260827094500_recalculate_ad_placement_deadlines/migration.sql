-- Existing placements may have been given a deletion deadline based only on
-- their booked time. A late Telegram publication must receive its full booked
-- duration (plus the existing one-hour safety window).
UPDATE "TelegramAdSalePlacement"
SET "plannedDeleteAt" = GREATEST("scheduledAt", "publishedAt")
  + (("deleteAfterHoursSnapshot" + 1) * INTERVAL '1 hour')
WHERE "publishedAt" IS NOT NULL
  AND "deleteAfterHoursSnapshot" IS NOT NULL
  AND "isPermanentSnapshot" = FALSE
  AND "deletedAt" IS NULL
  AND "plannedDeleteAt" IS DISTINCT FROM (
    GREATEST("scheduledAt", "publishedAt")
      + (("deleteAfterHoursSnapshot" + 1) * INTERVAL '1 hour')
  );
