ALTER TABLE "TelegramBotIntegration"
ADD COLUMN "financeLogoImage" BYTEA,
ADD COLUMN "financeLogoMimeType" TEXT,
ADD COLUMN "financeFaviconImage" BYTEA,
ADD COLUMN "financeFaviconMimeType" TEXT,
ADD COLUMN "financeBrandingUpdatedAt" TIMESTAMP(3);
