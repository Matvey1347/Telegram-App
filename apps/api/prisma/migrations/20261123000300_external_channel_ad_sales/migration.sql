ALTER TABLE "TelegramAdSale"
ADD COLUMN "externalChannelOwner" VARCHAR(160),
ADD COLUMN "externalAgreedAmount" DECIMAL(24,8);
