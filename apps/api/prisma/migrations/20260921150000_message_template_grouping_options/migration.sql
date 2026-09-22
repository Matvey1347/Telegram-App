CREATE TYPE "TelegramMessageTemplateGroupMode" AS ENUM ('CUSTOM', 'NETWORK');

ALTER TABLE "TelegramChannelMessageTemplate"
  ADD COLUMN "groupMode" "TelegramMessageTemplateGroupMode" NOT NULL DEFAULT 'CUSTOM',
  ADD COLUMN "channelGroupHeaderTemplate" TEXT;
