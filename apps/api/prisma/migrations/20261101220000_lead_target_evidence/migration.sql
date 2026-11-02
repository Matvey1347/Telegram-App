ALTER TABLE "TelegramLeadObservation" ADD COLUMN "targetEvidence" JSONB;
ALTER TABLE "TelegramLeadAnalysisQueue" ADD COLUMN "prefilterTargets" JSONB;
