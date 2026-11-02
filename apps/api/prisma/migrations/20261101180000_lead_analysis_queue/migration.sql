CREATE TABLE "TelegramLeadAutoConfig" (
  "sourceId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "overflowedAt" TIMESTAMP(3),
  CONSTRAINT "TelegramLeadAutoConfig_pkey" PRIMARY KEY ("sourceId", "workspaceId")
);
ALTER TABLE "TelegramLeadAutoConfig" ADD CONSTRAINT "TelegramLeadAutoConfig_sourceId_workspaceId_fkey" FOREIGN KEY ("sourceId", "workspaceId") REFERENCES "TelegramLeadSource"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "TelegramLeadObservation_id_workspaceId_sourceId_key" ON "TelegramLeadObservation"("id", "workspaceId", "sourceId");
CREATE TABLE "TelegramLeadAnalysisQueue" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "observationId" TEXT NOT NULL,
  "contentHash" VARCHAR(64) NOT NULL,
  "bindingRevision" INTEGER NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'WAIT_AUTH_RECHECK',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramLeadAnalysisQueue_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TelegramLeadAnalysisQueue_workspaceId_observationId_content_key" ON "TelegramLeadAnalysisQueue"("workspaceId", "observationId", "contentHash", "bindingRevision");
CREATE INDEX "TelegramLeadAnalysisQueue_workspaceId_sourceId_status_id_idx" ON "TelegramLeadAnalysisQueue"("workspaceId", "sourceId", "status", "id");
CREATE INDEX "TelegramLeadAnalysisQueue_workspaceId_status_idx" ON "TelegramLeadAnalysisQueue"("workspaceId", "status");
ALTER TABLE "TelegramLeadAnalysisQueue" ADD CONSTRAINT "TelegramLeadAnalysisQueue_observationId_workspaceId_source_fkey" FOREIGN KEY ("observationId", "workspaceId", "sourceId") REFERENCES "TelegramLeadObservation"("id", "workspaceId", "sourceId") ON DELETE CASCADE ON UPDATE CASCADE;
