ALTER TABLE "TelegramAdSale"
  ADD COLUMN IF NOT EXISTS "scheduledBotConfirmationSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "publishedBotConfirmationSentAt" TIMESTAMP(3);
