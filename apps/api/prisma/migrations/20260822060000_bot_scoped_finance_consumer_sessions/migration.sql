ALTER TABLE "TelegramBotIntegration"
ADD COLUMN "financeConsumerSessionTtlSeconds" INTEGER NOT NULL DEFAULT 2592000;

ALTER TABLE "TelegramBotIntegration"
ADD CONSTRAINT "TelegramBotIntegration_financeConsumerSessionTtlSeconds_check"
CHECK ("financeConsumerSessionTtlSeconds" > 0);
