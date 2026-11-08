ALTER TYPE "OperationsNotificationType" ADD VALUE IF NOT EXISTS 'AI_POSTING_AUTOPILOT';

CREATE TABLE "TelegramAiPostingAutopilotRun" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "telegramChannelId" TEXT NOT NULL,
  "settingsVersion" INTEGER NOT NULL,
  "retryOfRunId" TEXT,
  "trigger" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "currentStage" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "summary" JSONB,
  "failureType" TEXT,
  "failureMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramAiPostingAutopilotRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TelegramAiPostingAutopilotRun_workspaceId_telegramChannelId_createdAt_idx" ON "TelegramAiPostingAutopilotRun"("workspaceId", "telegramChannelId", "createdAt");
CREATE INDEX "TelegramAiPostingAutopilotRun_status_createdAt_idx" ON "TelegramAiPostingAutopilotRun"("status", "createdAt");

CREATE TABLE "TelegramAiPostingAutopilotStage" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "attempt" INTEGER NOT NULL DEFAULT 1,
  "postId" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "errorType" TEXT,
  "errorMessage" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramAiPostingAutopilotStage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TelegramAiPostingAutopilotStage_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TelegramAiPostingAutopilotRun"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TelegramAiPostingAutopilotStage_runId_createdAt_idx" ON "TelegramAiPostingAutopilotStage"("runId", "createdAt");

CREATE TABLE "TelegramAiPostingNotificationPreference" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "channelScopeKey" TEXT NOT NULL DEFAULT '*',
  "telegramBot" BOOLEAN NOT NULL DEFAULT false,
  "pwaPush" BOOLEAN NOT NULL DEFAULT true,
  "email" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramAiPostingNotificationPreference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TelegramAiPostingNotificationPreference_scope_key" ON "TelegramAiPostingNotificationPreference"("workspaceId", "memberId", "eventKey", "channelScopeKey");
CREATE INDEX "TelegramAiPostingNotificationPreference_workspaceId_memberId_idx" ON "TelegramAiPostingNotificationPreference"("workspaceId", "memberId");

CREATE TABLE "TelegramAiPostingNotificationDelivery" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "transport" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3),
  "claimOwner" TEXT,
  "claimExpiresAt" TIMESTAMP(3),
  "notificationId" TEXT,
  "lastErrorType" TEXT,
  "lastErrorMessage" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramAiPostingNotificationDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TelegramAiPostingNotificationDelivery_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TelegramAiPostingAutopilotRun"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TelegramAiPostingNotificationDelivery_runId_memberId_eventKey_transport_key" ON "TelegramAiPostingNotificationDelivery"("runId", "memberId", "eventKey", "transport");
CREATE INDEX "TelegramAiPostingNotificationDelivery_status_nextAttemptAt_idx" ON "TelegramAiPostingNotificationDelivery"("status", "nextAttemptAt");
CREATE INDEX "TelegramAiPostingNotificationDelivery_workspaceId_channelId_createdAt_idx" ON "TelegramAiPostingNotificationDelivery"("workspaceId", "channelId", "createdAt");
