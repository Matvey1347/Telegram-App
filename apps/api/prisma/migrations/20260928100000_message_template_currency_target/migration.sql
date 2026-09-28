ALTER TABLE "TelegramChannelMessageTemplate" ADD COLUMN "priceCurrency" VARCHAR(3) NOT NULL DEFAULT 'UAH';
ALTER TABLE "TelegramChannelMessageTemplate" ADD COLUMN "targetTotal" DECIMAL(65,30);
