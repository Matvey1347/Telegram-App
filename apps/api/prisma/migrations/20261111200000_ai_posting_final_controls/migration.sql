ALTER TABLE "TelegramPostPerformance"
ADD COLUMN "manualClassification" TEXT;

ALTER TABLE "TelegramAiPostingSettings"
ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'TEST',
ADD COLUMN "draftExpirationDays" INTEGER NOT NULL DEFAULT 30;

UPDATE "TelegramAiPostingSettings"
SET "mode" = CASE WHEN "autopilotEnabled" THEN 'AUTOPILOT' ELSE 'TEST' END;

CREATE INDEX "TelegramAiPostingSettings_mode_nextRun_idx"
ON "TelegramAiPostingSettings" ("mode", "autopilotNextRunAt");

ALTER TABLE "TelegramManagedPost"
ADD COLUMN "aiPostingReviewStatus" TEXT,
ADD COLUMN "aiPostingApprovedWithoutEdits" BOOLEAN,
ADD COLUMN "aiPostingRecheckRequired" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "TelegramManagedPost_aiPostingReviewStatus_scheduledAt_idx"
ON "TelegramManagedPost" ("aiPostingReviewStatus", "scheduledAt");
