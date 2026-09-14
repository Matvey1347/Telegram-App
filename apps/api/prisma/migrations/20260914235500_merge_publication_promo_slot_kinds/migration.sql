UPDATE "TelegramPublicationScheduleSlot"
SET "kind" = 'AD'
WHERE "kind" = 'MUTUAL_PROMOTION';

ALTER TYPE "TelegramPublicationSlotKind" RENAME TO "TelegramPublicationSlotKind_old";
CREATE TYPE "TelegramPublicationSlotKind" AS ENUM ('CONTENT', 'AD');

ALTER TABLE "TelegramPublicationScheduleSlot"
  ALTER COLUMN "kind" TYPE "TelegramPublicationSlotKind"
  USING ("kind"::text::"TelegramPublicationSlotKind");

DROP TYPE "TelegramPublicationSlotKind_old";
