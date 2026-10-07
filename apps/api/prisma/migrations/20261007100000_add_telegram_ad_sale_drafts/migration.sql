CREATE TABLE "TelegramAdSaleDraft" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "title" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TelegramAdSaleDraft_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TelegramAdSaleDraft_workspaceId_createdByUserId_updatedAt_idx"
ON "TelegramAdSaleDraft"("workspaceId", "createdByUserId", "updatedAt");
