CREATE TYPE "PublicationConfirmationDestination" AS ENUM ('TELEGRAM_PRIVATE', 'TELEGRAM_GROUP', 'DISABLED');

ALTER TABLE "Workspace"
  ADD COLUMN "scheduledConfirmationDestination" "PublicationConfirmationDestination" NOT NULL DEFAULT 'TELEGRAM_PRIVATE',
  ADD COLUMN "publishedConfirmationDestination" "PublicationConfirmationDestination" NOT NULL DEFAULT 'TELEGRAM_PRIVATE';
