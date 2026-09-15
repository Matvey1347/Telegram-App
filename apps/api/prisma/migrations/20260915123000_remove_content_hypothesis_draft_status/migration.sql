ALTER TABLE "TelegramContentHypothesis"
  ALTER COLUMN "status" DROP DEFAULT;

UPDATE "TelegramContentHypothesis"
SET "status" = 'ACTIVE'
WHERE "status" = 'DRAFT';

CREATE TYPE "TelegramContentHypothesisStatus_new" AS ENUM (
  'ACTIVE',
  'SUCCESSFUL',
  'FAILED',
  'ARCHIVED'
);

ALTER TABLE "TelegramContentHypothesis"
  ALTER COLUMN "status" TYPE "TelegramContentHypothesisStatus_new"
  USING ("status"::text::"TelegramContentHypothesisStatus_new");

DROP TYPE "TelegramContentHypothesisStatus";
ALTER TYPE "TelegramContentHypothesisStatus_new"
  RENAME TO "TelegramContentHypothesisStatus";

ALTER TABLE "TelegramContentHypothesis"
  ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
