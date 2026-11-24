ALTER TABLE "TelegramSupportTicket" ADD COLUMN "botId" TEXT;

UPDATE "TelegramSupportTicket" AS ticket
SET "botId" = split_part(message."updateId", ':', 1)
FROM "TelegramSupportMessage" AS message
WHERE message."ticketId" = ticket."id"
  AND message."updateId" ~ '^[0-9]+:[0-9]+$';

DROP INDEX "TelegramSupportTicket_chat_idx";
CREATE INDEX "TelegramSupportTicket_chat_idx"
ON "TelegramSupportTicket"("workspaceId", "product", "botId", "chatId", "closedAt");
