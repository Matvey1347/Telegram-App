CREATE TYPE "PublicationNotificationDestination" AS ENUM ('IN_APP', 'TELEGRAM_GROUP', 'TELEGRAM_PRIVATE');
ALTER TABLE "Workspace"
  ADD COLUMN "coverageNotificationDestination" "PublicationNotificationDestination" NOT NULL DEFAULT 'TELEGRAM_GROUP',
  ADD COLUMN "autopilotNotificationDestination" "PublicationNotificationDestination" NOT NULL DEFAULT 'TELEGRAM_GROUP',
  ADD COLUMN "autopilotErrorNotificationDestination" "PublicationNotificationDestination" NOT NULL DEFAULT 'TELEGRAM_GROUP';
ALTER TABLE "TelegramAiPostingNotificationDelivery"
  ADD COLUMN "telegramMessage" TEXT,
  ADD COLUMN "telegramParseMode" TEXT;
