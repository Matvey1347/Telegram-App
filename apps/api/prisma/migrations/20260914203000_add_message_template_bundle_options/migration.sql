ALTER TABLE "TelegramChannelMessageTemplate"
ADD COLUMN "productNameOverrides" JSONB NOT NULL DEFAULT '{}'::JSONB,
ADD COLUMN "bundleOfferEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "bundleDiscountPercent" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN "bundleBasePriceOverrides" JSONB NOT NULL DEFAULT '{}'::JSONB;
