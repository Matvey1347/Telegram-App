-- Lead Discovery only. No data backfill, external calls, or legacy schema changes.

CREATE TABLE "TelegramLeadSource" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "normalizedKey" VARCHAR(200) NOT NULL,
    "channelId" VARCHAR(40),
    "username" VARCHAR(100),
    "title" VARCHAR(300) NOT NULL,
    "url" VARCHAR(500),
    "accountId" TEXT,
    "accessType" VARCHAR(40) NOT NULL DEFAULT 'UNVERIFIED',
    "addedVia" VARCHAR(40) NOT NULL DEFAULT 'MANUAL',
    "processingReference" VARCHAR(100) NOT NULL,
    "allowOwnChannel" BOOLEAN NOT NULL DEFAULT false,
    "monitoringState" VARCHAR(30) NOT NULL DEFAULT 'PAUSED',
    "monitoringActorUserId" TEXT NOT NULL,
    "lastObservedAt" TIMESTAMP(3),
    "lastAdAt" TIMESTAMP(3),
    "checkpointMessageId" INTEGER,
    "channelPts" INTEGER,
    "coverageFrom" TIMESTAMP(3),
    "coverageTo" TIMESTAMP(3),
    "coverageState" VARCHAR(40) NOT NULL DEFAULT 'UNPROVEN',
    "lastErrorCode" VARCHAR(80),
    "lastErrorAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramLeadSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramLeadCandidate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "identityKey" VARCHAR(200),
    "title" VARCHAR(300) NOT NULL,
    "niche" VARCHAR(300) NOT NULL DEFAULT '',
    "offerType" VARCHAR(300) NOT NULL DEFAULT '',
    "sourceIds" JSONB NOT NULL DEFAULT '[]',
    "contacts" JSONB NOT NULL,
    "riskStatus" VARCHAR(30) NOT NULL DEFAULT 'NEEDS_REVIEW',
    "risks" JSONB NOT NULL,
    "reviewStatus" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    "reviewHistory" JSONB NOT NULL,
    "contactId" TEXT,
    "mergedIntoId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramLeadCandidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramLeadObservation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "candidateId" TEXT,
    "externalMessageId" VARCHAR(120) NOT NULL,
    "messageUrl" VARCHAR(500),
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "editedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "text" VARCHAR(4096) NOT NULL,
    "links" JSONB NOT NULL,
    "contentHash" VARCHAR(64) NOT NULL,
    "originalStatus" VARCHAR(30) NOT NULL DEFAULT 'OBSERVED',
    "processingStatus" VARCHAR(40) NOT NULL DEFAULT 'PENDING',
    "reviewStatus" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    "classificationVersion" VARCHAR(80),
    "extractionVersion" VARCHAR(80),
    "classification" JSONB,
    "extraction" JSONB,
    "classificationOperationId" VARCHAR(100),
    "extractionOperationId" VARCHAR(100),
    "classificationOperationDbId" TEXT,
    "extractionOperationDbId" TEXT,
    "processingStartedAt" TIMESTAMP(3),

    CONSTRAINT "TelegramLeadObservation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TelegramLeadSource_workspaceId_createdAt_id_idx" ON "TelegramLeadSource"("workspaceId", "createdAt", "id");

CREATE INDEX "TelegramLeadSource_monitoringState_accountId_workspaceId_idx" ON "TelegramLeadSource"("monitoringState", "accountId", "workspaceId");

CREATE UNIQUE INDEX "TelegramLeadSource_id_workspaceId_key" ON "TelegramLeadSource"("id", "workspaceId");

CREATE UNIQUE INDEX "TelegramLeadSource_workspaceId_normalizedKey_key" ON "TelegramLeadSource"("workspaceId", "normalizedKey");

CREATE UNIQUE INDEX "TelegramLeadSource_workspaceId_channelId_key" ON "TelegramLeadSource"("workspaceId", "channelId");

CREATE INDEX "TelegramLeadCandidate_workspaceId_reviewStatus_createdAt_id_idx" ON "TelegramLeadCandidate"("workspaceId", "reviewStatus", "createdAt", "id");

CREATE INDEX "TelegramLeadCandidate_expiresAt_id_idx" ON "TelegramLeadCandidate"("expiresAt", "id");

CREATE INDEX "TelegramLeadCandidate_workspaceId_contactId_idx" ON "TelegramLeadCandidate"("workspaceId", "contactId");

CREATE INDEX "TelegramLeadCandidate_workspaceId_mergedIntoId_idx" ON "TelegramLeadCandidate"("workspaceId", "mergedIntoId");

CREATE UNIQUE INDEX "TelegramLeadCandidate_id_workspaceId_key" ON "TelegramLeadCandidate"("id", "workspaceId");

CREATE UNIQUE INDEX "TelegramLeadCandidate_workspaceId_identityKey_key" ON "TelegramLeadCandidate"("workspaceId", "identityKey");

CREATE INDEX "TelegramLeadObservation_workspaceId_observedAt_id_idx" ON "TelegramLeadObservation"("workspaceId", "observedAt", "id");

CREATE INDEX "TelegramLeadObservation_workspaceId_sourceId_publishedAt_id_idx" ON "TelegramLeadObservation"("workspaceId", "sourceId", "publishedAt", "id");

CREATE INDEX "TelegramLeadObservation_workspaceId_candidateId_observedAt__idx" ON "TelegramLeadObservation"("workspaceId", "candidateId", "observedAt", "id");

CREATE INDEX "TelegramLeadObservation_expiresAt_id_idx" ON "TelegramLeadObservation"("expiresAt", "id");

CREATE UNIQUE INDEX "TelegramLeadObservation_workspaceId_sourceId_externalMessag_key" ON "TelegramLeadObservation"("workspaceId", "sourceId", "externalMessageId");

ALTER TABLE "TelegramLeadSource" ADD CONSTRAINT "TelegramLeadSource_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramLeadSource" ADD CONSTRAINT "TelegramLeadSource_accountId_workspaceId_fkey" FOREIGN KEY ("accountId", "workspaceId") REFERENCES "TelegramUserAccountIntegration"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TelegramLeadCandidate" ADD CONSTRAINT "TelegramLeadCandidate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramLeadCandidate" ADD CONSTRAINT "TelegramLeadCandidate_contactId_workspaceId_fkey" FOREIGN KEY ("contactId", "workspaceId") REFERENCES "TelegramAdvertiser"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TelegramLeadObservation" ADD CONSTRAINT "TelegramLeadObservation_sourceId_workspaceId_fkey" FOREIGN KEY ("sourceId", "workspaceId") REFERENCES "TelegramLeadSource"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramLeadObservation" ADD CONSTRAINT "TelegramLeadObservation_candidateId_workspaceId_fkey" FOREIGN KEY ("candidateId", "workspaceId") REFERENCES "TelegramLeadCandidate"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TelegramLeadObservation" ADD CONSTRAINT "TelegramLeadObservation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramLeadCandidate" ADD CONSTRAINT "TelegramLeadCandidate_revision_positive" CHECK ("revision" > 0);
