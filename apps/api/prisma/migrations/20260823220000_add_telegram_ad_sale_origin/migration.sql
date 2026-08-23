CREATE TYPE "TelegramAdSaleOrigin" AS ENUM ('DIRECT', 'ADSELL_IO');

ALTER TABLE "TelegramAdSale"
ADD COLUMN "origin" "TelegramAdSaleOrigin" NOT NULL DEFAULT 'DIRECT';
