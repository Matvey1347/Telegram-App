CREATE TABLE "TelegramLeadHistoryJob" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "status" VARCHAR(24) NOT NULL,
  "cutoffAt" TIMESTAMP(3) NOT NULL,
  "beforeId" INTEGER,
  "pages" INTEGER NOT NULL DEFAULT 0,
  "received" INTEGER NOT NULL DEFAULT 0,
  "hasGaps" BOOLEAN NOT NULL DEFAULT false,
  "lastErrorCode" VARCHAR(100),
  "leaseToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramLeadHistoryJob_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TelegramLeadHistoryJob_sourceId_workspaceId_key" ON "TelegramLeadHistoryJob"("sourceId", "workspaceId");
CREATE INDEX "TelegramLeadHistoryJob_status_leaseUntil_idx" ON "TelegramLeadHistoryJob"("status", "leaseUntil");
ALTER TABLE "TelegramLeadHistoryJob" ADD CONSTRAINT "TelegramLeadHistoryJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramLeadHistoryJob" ADD CONSTRAINT "TelegramLeadHistoryJob_sourceId_workspaceId_fkey" FOREIGN KEY ("sourceId", "workspaceId") REFERENCES "TelegramLeadSource"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
