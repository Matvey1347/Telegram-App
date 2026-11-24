CREATE TYPE "FinanceAssistantChatMode" AS ENUM ('GENERAL', 'ADVICE', 'TRANSACTIONS');

CREATE TABLE "FinanceAssistantChat" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "mode" "FinanceAssistantChatMode" NOT NULL DEFAULT 'GENERAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FinanceAssistantChat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceAssistantTurn" (
    "chatId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "userText" TEXT NOT NULL,
    "replyTo" JSONB,
    "assistantText" TEXT,
    "result" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FinanceAssistantTurn_pkey" PRIMARY KEY ("chatId","requestId")
);

CREATE INDEX "FinanceAssistantChat_profileId_updatedAt_id_idx" ON "FinanceAssistantChat"("profileId","updatedAt","id");
CREATE INDEX "FinanceAssistantTurn_chatId_createdAt_requestId_idx" ON "FinanceAssistantTurn"("chatId","createdAt","requestId");

ALTER TABLE "FinanceAssistantChat" ADD CONSTRAINT "FinanceAssistantChat_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "FinanceProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceAssistantTurn" ADD CONSTRAINT "FinanceAssistantTurn_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "FinanceAssistantChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
