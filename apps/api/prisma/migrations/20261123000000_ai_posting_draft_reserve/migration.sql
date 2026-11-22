BEGIN;
SET LOCAL lock_timeout = '2s';

ALTER TABLE "TelegramManagedPost"
  ADD COLUMN "aiPostingSphereId" TEXT,
  ADD COLUMN "aiPostingRubricId" TEXT,
  ADD COLUMN "aiPostingLengthId" TEXT;

COMMIT;
