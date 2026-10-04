-- Publication-slot times used to be stored as unlabelled wall-clock strings.
-- The product default at their introduction was Europe/Warsaw.  Interpret
-- legacy values in that zone once, then persist the canonical UTC time-of-day.
UPDATE "TelegramPublicationScheduleSlot"
SET "time" = to_char(
  ((CURRENT_DATE + "time"::time) AT TIME ZONE 'Europe/Warsaw') AT TIME ZONE 'UTC',
  'HH24:MI'
);
