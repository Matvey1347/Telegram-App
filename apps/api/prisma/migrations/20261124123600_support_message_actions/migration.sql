ALTER TABLE "TelegramSupportMessage"
    ADD COLUMN "telegramMessageId" INTEGER,
    ADD COLUMN "replyToTelegramId" INTEGER,
    ADD COLUMN "editedAt" TIMESTAMP(3),
    ADD COLUMN "deletedAt" TIMESTAMP(3),
    ADD COLUMN "reactions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "reactionDate" INTEGER,
    ADD COLUMN "reactionUpdateId" BIGINT;

CREATE INDEX "TelegramSupportMessage_telegram_idx"
    ON "TelegramSupportMessage"("ticketId", "telegramMessageId");
