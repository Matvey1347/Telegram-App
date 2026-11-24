CREATE TYPE "TelegramSupportProduct" AS ENUM ('NEXELOQ', 'GROSHLY');

CREATE TABLE "TelegramSupportTicket" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "product" "TelegramSupportProduct" NOT NULL,
    "chatId" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "username" TEXT,
    "preview" TEXT NOT NULL,
    "needsReply" BOOLEAN NOT NULL DEFAULT true,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TelegramSupportTicket_pkey" PRIMARY KEY ("id"),
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "TelegramSupportMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "product" "TelegramSupportProduct" NOT NULL,
    "updateId" TEXT,
    "replyId" TEXT,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TelegramSupportMessage_pkey" PRIMARY KEY ("id"),
    FOREIGN KEY ("ticketId") REFERENCES "TelegramSupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TelegramSupportTicket_inbox_idx" ON "TelegramSupportTicket"("workspaceId", "closedAt", "updatedAt", "id");
CREATE INDEX "TelegramSupportTicket_chat_idx" ON "TelegramSupportTicket"("workspaceId", "product", "chatId", "closedAt");
CREATE UNIQUE INDEX "TelegramSupportMessage_update_key" ON "TelegramSupportMessage"("workspaceId", "product", "updateId");
CREATE UNIQUE INDEX "TelegramSupportMessage_reply_key" ON "TelegramSupportMessage"("ticketId", "replyId");
CREATE INDEX "TelegramSupportMessage_thread_idx" ON "TelegramSupportMessage"("ticketId", "createdAt", "id");
