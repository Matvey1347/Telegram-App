ALTER TABLE "TelegramBotRuntimeInstance"
ADD COLUMN "avatarImage" BYTEA,
ADD COLUMN "avatarMimeType" TEXT,
ADD COLUMN "avatarTelegramFileId" TEXT,
ADD COLUMN "avatarUpdatedAt" TIMESTAMP(3);
