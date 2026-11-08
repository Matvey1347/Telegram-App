ALTER TABLE "TelegramAiPostingSettings"
  ADD COLUMN "postsPerDay" INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN "targetReadyDrafts" INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN "maxReadyDrafts" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "targetCoverageDays" INTEGER NOT NULL DEFAULT 14,
  ADD COLUMN "criticalCoverageDays" INTEGER NOT NULL DEFAULT 7,
  ADD COLUMN "autopilotNextRunAt" TIMESTAMP(3),
  ADD COLUMN "autopilotRetryOfRunId" TEXT,
  ADD COLUMN "autopilotLeaseOwner" TEXT,
  ADD COLUMN "autopilotLeaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "autopilotLastRunAt" TIMESTAMP(3),
  ADD COLUMN "autopilotLastStatus" TEXT,
  ADD COLUMN "autopilotLastError" TEXT,
  ADD COLUMN "autopilotLastSummary" JSONB;
CREATE INDEX "TelegramAiPostingSettings_autopilotEnabled_autopilotNextRunAt_idx"
  ON "TelegramAiPostingSettings"("autopilotEnabled", "autopilotNextRunAt");
