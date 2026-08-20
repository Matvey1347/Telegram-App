DROP TABLE IF EXISTS "TelegramAdSalesTextTemplate";

ALTER TABLE "TelegramChannel"
  DROP COLUMN IF EXISTS "offerChannelUrl",
  DROP COLUMN IF EXISTS "offerTgStatUrl";
