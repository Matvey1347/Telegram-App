ALTER TABLE "TelegramAiPostingSettings"
  ADD COLUMN "aiDailyBudget" DECIMAL(24,12),
  ADD COLUMN "aiMonthlyBudget" DECIMAL(24,12);

ALTER TABLE "AiOperation"
  ADD COLUMN "aiPostingChannelId" VARCHAR(100),
  ADD COLUMN "aiPostingTestRunId" VARCHAR(100),
  ADD COLUMN "aiPostingAutopilotRunId" VARCHAR(100),
  ADD COLUMN "aiPostingPublicationIndex" INTEGER,
  ADD COLUMN "aiPostingAttempt" INTEGER,
  ADD COLUMN "aiPostingMode" VARCHAR(16),
  ADD COLUMN "aiPostingManagedPostId" VARCHAR(100);

CREATE INDEX "AiOperation_workspaceId_aiPostingChannelId_createdAt_idx"
  ON "AiOperation"("workspaceId", "aiPostingChannelId", "createdAt");
CREATE INDEX "AiOperation_workspaceId_aiPostingTestRunId_aiPostingPublicationIndex_idx"
  ON "AiOperation"("workspaceId", "aiPostingTestRunId", "aiPostingPublicationIndex");
CREATE INDEX "AiOperation_workspaceId_aiPostingAutopilotRunId_aiPostingPublicationIndex_idx"
  ON "AiOperation"("workspaceId", "aiPostingAutopilotRunId", "aiPostingPublicationIndex");
CREATE INDEX "AiOperation_workspaceId_aiPostingManagedPostId_idx"
  ON "AiOperation"("workspaceId", "aiPostingManagedPostId");

ALTER TABLE "AiUsageDaily"
  ADD COLUMN "aiPostingChannelId" VARCHAR(100) NOT NULL DEFAULT '',
  ADD COLUMN "aiPostingPublicationKey" VARCHAR(140) NOT NULL DEFAULT '',
  ADD COLUMN "aiPostingMode" VARCHAR(16) NOT NULL DEFAULT 'NONE';

DROP INDEX "AiUsageDaily_dimensions_key";
CREATE UNIQUE INDEX "AiUsageDaily_dimensions_key"
  ON "AiUsageDaily"("workspaceId", "day", "category", "provider", "model", "status", "aiPostingChannelId", "aiPostingPublicationKey", "aiPostingMode");
