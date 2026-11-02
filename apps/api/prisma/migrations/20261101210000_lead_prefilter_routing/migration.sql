ALTER TABLE "TelegramLeadObservation" ADD COLUMN "metadataComplete" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "metadataTextOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TelegramLeadAnalysisQueue"
  ADD COLUMN "prefilterDecision" VARCHAR(24),
  ADD COLUMN "prefilterVersion" VARCHAR(80),
  ADD COLUMN "prefilterReason" VARCHAR(300),
  ADD COLUMN "prefilterSignals" JSONB;
