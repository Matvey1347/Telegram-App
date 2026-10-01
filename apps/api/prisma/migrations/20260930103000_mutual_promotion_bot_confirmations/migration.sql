ALTER TABLE "MutualPromotionFolder"
  ADD COLUMN IF NOT EXISTS "scheduledBotConfirmationSentAt" TIMESTAMP(3);

ALTER TABLE "MutualPromotionFolderPost"
  ADD COLUMN IF NOT EXISTS "publishedBotConfirmationSentAt" TIMESTAMP(3);
