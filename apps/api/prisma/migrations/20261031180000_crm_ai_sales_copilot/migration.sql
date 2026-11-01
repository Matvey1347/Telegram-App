-- Additive CRM draft storage only. No provider calls, enablement or financial ledger migration.

-- CreateTable
CREATE TABLE "TelegramCrmAiDraft" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "operationId" VARCHAR(100) NOT NULL,
    "category" VARCHAR(80) NOT NULL,
    "tone" VARCHAR(30) NOT NULL,
    "language" VARCHAR(10) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'GENERATING',
    "text" VARCHAR(4096) NOT NULL DEFAULT '',
    "output" JSONB,
    "facts" JSONB NOT NULL,
    "missingFacts" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "contextVersion" VARCHAR(80) NOT NULL,
    "requestFingerprint" VARCHAR(64) NOT NULL,
    "requestSnapshot" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "approvedTextHash" VARCHAR(64),
    "approvedAt" TIMESTAMP(3),
    "operationDbId" TEXT,
    "sentMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramCrmAiDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TelegramCrmAiDraft_workspaceId_conversationId_authorUserId__idx" ON "TelegramCrmAiDraft"("workspaceId", "conversationId", "authorUserId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "TelegramCrmAiDraft_expiresAt_id_idx" ON "TelegramCrmAiDraft"("expiresAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramCrmAiDraft_workspaceId_operationId_key" ON "TelegramCrmAiDraft"("workspaceId", "operationId");

-- AddForeignKey
ALTER TABLE "TelegramCrmAiDraft" ADD CONSTRAINT "TelegramCrmAiDraft_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramCrmAiDraft" ADD CONSTRAINT "TelegramCrmAiDraft_conversationId_workspaceId_fkey" FOREIGN KEY ("conversationId", "workspaceId") REFERENCES "TelegramCrmConversation"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramCrmAiDraft" ADD CONSTRAINT "TelegramCrmAiDraft_revision_positive" CHECK ("revision" > 0);
