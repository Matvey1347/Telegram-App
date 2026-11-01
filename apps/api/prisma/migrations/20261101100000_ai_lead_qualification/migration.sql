-- Additive candidate preparation only. Existing CRM conversation FKs remain required.
ALTER TABLE "TelegramLeadCandidate"
 ADD COLUMN "qualificationDecision" VARCHAR(30),
 ADD COLUMN "qualificationContextVersion" VARCHAR(64),
 ADD COLUMN "qualificationReviewedAt" TIMESTAMP(3),
 ADD COLUMN "qualificationReviewerUserId" TEXT,
 ADD COLUMN "riskAcknowledgedAt" TIMESTAMP(3);

CREATE TABLE "TelegramLeadQualification" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "operationId" VARCHAR(100) NOT NULL,
    "operationDbId" TEXT,
    "contextVersion" VARCHAR(64) NOT NULL,
    "policyVersion" VARCHAR(80) NOT NULL,
    "requestSnapshot" JSONB NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'GENERATING',
    "output" JSONB,
    "score" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramLeadQualification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramLeadCandidateDraft" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "operationId" VARCHAR(100) NOT NULL,
    "operationDbId" TEXT,
    "category" VARCHAR(40) NOT NULL DEFAULT 'SALES_FIRST_DRAFT',
    "requestFingerprint" VARCHAR(64) NOT NULL,
    "contextVersion" VARCHAR(64) NOT NULL,
    "requestSnapshot" JSONB NOT NULL,
    "evidenceRefs" JSONB NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'GENERATING',
    "tone" VARCHAR(30) NOT NULL,
    "language" VARCHAR(10) NOT NULL,
    "text" VARCHAR(3000) NOT NULL DEFAULT '',
    "output" JSONB,
    "warnings" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "approvedAt" TIMESTAMP(3),
    "approvalHash" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramLeadCandidateDraft_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TelegramLeadQualification_workspaceId_candidateId_contextVe_idx" ON "TelegramLeadQualification"("workspaceId", "candidateId", "contextVersion", "createdAt");

CREATE INDEX "TelegramLeadQualification_expiresAt_id_idx" ON "TelegramLeadQualification"("expiresAt", "id");

CREATE UNIQUE INDEX "TelegramLeadQualification_workspaceId_operationId_key" ON "TelegramLeadQualification"("workspaceId", "operationId");

CREATE INDEX "TelegramLeadCandidateDraft_workspaceId_candidateId_authorUs_idx" ON "TelegramLeadCandidateDraft"("workspaceId", "candidateId", "authorUserId", "createdAt", "id");

CREATE INDEX "TelegramLeadCandidateDraft_workspaceId_candidateId_requestF_idx" ON "TelegramLeadCandidateDraft"("workspaceId", "candidateId", "requestFingerprint");

CREATE INDEX "TelegramLeadCandidateDraft_expiresAt_id_idx" ON "TelegramLeadCandidateDraft"("expiresAt", "id");

CREATE UNIQUE INDEX "TelegramLeadCandidateDraft_workspaceId_operationId_key" ON "TelegramLeadCandidateDraft"("workspaceId", "operationId");

ALTER TABLE "TelegramLeadQualification" ADD CONSTRAINT "TelegramLeadQualification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramLeadQualification" ADD CONSTRAINT "TelegramLeadQualification_candidateId_workspaceId_fkey" FOREIGN KEY ("candidateId", "workspaceId") REFERENCES "TelegramLeadCandidate"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramLeadCandidateDraft" ADD CONSTRAINT "TelegramLeadCandidateDraft_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramLeadCandidateDraft" ADD CONSTRAINT "TelegramLeadCandidateDraft_candidateId_workspaceId_fkey" FOREIGN KEY ("candidateId", "workspaceId") REFERENCES "TelegramLeadCandidate"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramLeadCandidateDraft" ADD CONSTRAINT "TelegramLeadCandidateDraft_revision_positive" CHECK ("revision" > 0);
