-- Publication schedules are reusable daily templates. Collapse the legacy
-- weekday copies before removing weekday/timezone configuration from them.
CREATE TEMP TABLE "_PublicationScheduleSlotMerge" AS
SELECT
  "id" AS "duplicateId",
  first_value("id") OVER (
    PARTITION BY "scheduleId", "title", "kind", "time", COALESCE("iconId", '')
    ORDER BY "position", "id"
  ) AS "keeperId",
  row_number() OVER (
    PARTITION BY "scheduleId", "title", "kind", "time", COALESCE("iconId", '')
    ORDER BY "position", "id"
  ) AS "duplicateRank"
FROM "TelegramPublicationScheduleSlot";

UPDATE "TelegramManagedPost" AS post
SET "publicationSlotId" = merge."keeperId"
FROM "_PublicationScheduleSlotMerge" AS merge
WHERE post."publicationSlotId" = merge."duplicateId"
  AND merge."duplicateRank" > 1;

INSERT INTO "TelegramChannelPublicationScheduleSelectedSlot" ("assignmentId", "slotId")
SELECT selected."assignmentId", merge."keeperId"
FROM "TelegramChannelPublicationScheduleSelectedSlot" AS selected
JOIN "_PublicationScheduleSlotMerge" AS merge
  ON merge."duplicateId" = selected."slotId"
WHERE merge."duplicateRank" > 1
ON CONFLICT DO NOTHING;

DELETE FROM "TelegramChannelPublicationScheduleSelectedSlot" AS selected
USING "_PublicationScheduleSlotMerge" AS merge
WHERE selected."slotId" = merge."duplicateId"
  AND merge."duplicateRank" > 1;

DELETE FROM "TelegramPublicationScheduleSlot" AS slot
USING "_PublicationScheduleSlotMerge" AS merge
WHERE slot."id" = merge."duplicateId"
  AND merge."duplicateRank" > 1;

DROP TABLE "_PublicationScheduleSlotMerge";

ALTER TABLE "TelegramPublicationSchedule" ADD COLUMN "iconId" TEXT;
ALTER TABLE "TelegramPublicationSchedule" DROP COLUMN "timezone";
ALTER TABLE "TelegramPublicationScheduleSlot" DROP COLUMN "weekday";
ALTER TABLE "TelegramPublicationScheduleSlot" DROP COLUMN "timezone";

DROP INDEX "TelegramPublicationScheduleSlot_scheduleId_weekday_position_idx";
CREATE INDEX "TelegramPublicationScheduleSlot_scheduleId_position_idx"
  ON "TelegramPublicationScheduleSlot"("scheduleId", "position");
CREATE INDEX "TelegramPublicationSchedule_iconId_idx"
  ON "TelegramPublicationSchedule"("iconId");

ALTER TABLE "TelegramPublicationSchedule"
  ADD CONSTRAINT "TelegramPublicationSchedule_iconId_fkey"
  FOREIGN KEY ("iconId") REFERENCES "Icon"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
