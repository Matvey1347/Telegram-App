ALTER TABLE "TelegramLeadAnalysisQueue"
  ADD COLUMN "claimToken" TEXT,
  ADD COLUMN "claimUntil" TIMESTAMP(3),
  ADD COLUMN "lastErrorCode" VARCHAR(100);
CREATE INDEX "TelegramLeadAnalysisQueue_status_claimUntil_idx"
  ON "TelegramLeadAnalysisQueue" ("status", "claimUntil");
