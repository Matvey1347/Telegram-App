-- Additive canonical CRM extensions. No profile lookup, legacy promotion or fake messages.
ALTER TABLE "TelegramAdvertiser"
 ADD COLUMN "manualInstagramContactAt" TIMESTAMP(3),
 ADD COLUMN "manualInstagramReplyAt" TIMESTAMP(3);
ALTER TABLE "TelegramAdvertiserContact"
 ADD COLUMN "identityState" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
 ADD COLUMN "ownershipConfirmedAt" TIMESTAMP(3),
 ADD COLUMN "ownershipConfirmedByUserId" TEXT;
ALTER TABLE "TelegramAdvertiserActivity"
 ADD COLUMN "operationId" VARCHAR(100),
 ADD COLUMN "requestFingerprint" VARCHAR(64);
ALTER TABLE "TelegramAdvertiserTask"
 ADD COLUMN "manualOperationId" VARCHAR(100),
 ADD COLUMN "manualRequestFingerprint" VARCHAR(64);
CREATE UNIQUE INDEX "TelegramAdvertiserActivity_workspaceId_operationId_key" ON "TelegramAdvertiserActivity"("workspaceId", "operationId");
CREATE UNIQUE INDEX "TelegramAdvertiserTask_workspaceId_manualOperationId_key" ON "TelegramAdvertiserTask"("workspaceId", "manualOperationId");
CREATE INDEX "TelegramAdSale_workspaceId_sourceAdvertiserActivityId_idx" ON "TelegramAdSale"("workspaceId", "sourceAdvertiserActivityId");
-- SQL-owned partial retention index: only this stage's manual report subset.
CREATE INDEX "TelegramAdvertiserActivity_instagram_manual_retention_idx"
 ON "TelegramAdvertiserActivity"("createdAt", "id")
 WHERE metadata->>'kind' IN ('MANUAL_ACTIVITY','INSTAGRAM_IDENTITY') AND metadata->>'channel'='INSTAGRAM';
