ALTER TABLE "TelegramSupportMessage"
    ADD COLUMN "automatic" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "formatted" BOOLEAN NOT NULL DEFAULT false;
