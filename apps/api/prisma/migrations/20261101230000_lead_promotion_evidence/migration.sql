CREATE TABLE "TelegramLeadPromotion" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "targetSourceId" TEXT NOT NULL,
  "sourceChannelId" VARCHAR(40) NOT NULL,
  "targetChannelId" VARCHAR(40) NOT NULL,
  "sourceBindingRevision" INTEGER NOT NULL,
  "targetBindingRevision" INTEGER NOT NULL,
  "observationId" TEXT NOT NULL,
  "observationHash" VARCHAR(64) NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL,
  "evidence" JSONB NOT NULL,
  "verificationStatus" VARCHAR(40) NOT NULL,
  "classificationVersion" VARCHAR(80) NOT NULL,
  "pairedObservationId" TEXT,
  "pairedPublishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramLeadPromotion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TelegramLeadPromotion_observationId_workspaceId_sourceId_fkey" FOREIGN KEY ("observationId", "workspaceId", "sourceId") REFERENCES "TelegramLeadObservation"("id", "workspaceId", "sourceId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TelegramLeadPromotion_workspaceId_observationId_key" ON "TelegramLeadPromotion"("workspaceId", "observationId");
CREATE INDEX "TelegramLeadPromotion_reverse_idx" ON "TelegramLeadPromotion"("workspaceId", "sourceChannelId", "targetChannelId", "publishedAt");
