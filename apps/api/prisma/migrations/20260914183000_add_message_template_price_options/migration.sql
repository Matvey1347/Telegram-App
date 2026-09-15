CREATE TYPE "TelegramMessageTemplatePriceRounding" AS ENUM (
  'NONE',
  'NEAREST_5',
  'NEAREST_10'
);

ALTER TABLE "TelegramChannelMessageTemplate"
ADD COLUMN "excludedProductNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "priceRounding" "TelegramMessageTemplatePriceRounding" NOT NULL DEFAULT 'NONE';
