ALTER TABLE "TelegramChannelMessageTemplate"
  ADD COLUMN "groupChannels" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "channelGroupLabels" JSONB NOT NULL DEFAULT '{}';
