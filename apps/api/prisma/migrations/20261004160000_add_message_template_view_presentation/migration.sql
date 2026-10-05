ALTER TABLE "TelegramChannelMessageTemplate"
  ADD COLUMN "totalViewsLabel" VARCHAR(80) NOT NULL DEFAULT 'Total views',
  ADD COLUMN "viewsRounding" VARCHAR(20) NOT NULL DEFAULT 'NONE';
