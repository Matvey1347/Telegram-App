ALTER TYPE "OperationsNotificationType" ADD VALUE 'CHANNEL_POSTS_REMINDER';
ALTER TABLE "OperationsNotificationPreference" ADD COLUMN "channelRemindersPushEnabled" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "channelRemindersTelegramEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OperationsNotification" ADD COLUMN "channelReminderTelegramSentAt" TIMESTAMP(3);
CREATE TABLE "TelegramChannelReminderTemplate" (
  "id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL,
  "daysBefore" INTEGER[] NOT NULL, "notifyEmpty" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramChannelReminderTemplate_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "TelegramChannelReminderTemplate_id_workspaceId_key" ON "TelegramChannelReminderTemplate"("id", "workspaceId");
CREATE INDEX "TelegramChannelReminderTemplate_workspaceId_createdAt_idx" ON "TelegramChannelReminderTemplate"("workspaceId", "createdAt");
CREATE TABLE "TelegramChannelReminderAssignment" (
  "id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "channelId" TEXT NOT NULL, "templateId" TEXT NOT NULL, "nextDueAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramChannelReminderAssignment_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE,
  CONSTRAINT "TelegramChannelReminderAssignment_channel_fkey" FOREIGN KEY ("channelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE,
  CONSTRAINT "TelegramChannelReminderAssignment_template_fkey" FOREIGN KEY ("templateId", "workspaceId") REFERENCES "TelegramChannelReminderTemplate"("id", "workspaceId") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "TelegramChannelReminderAssignment_channelId_key" ON "TelegramChannelReminderAssignment"("channelId");
CREATE INDEX "TelegramChannelReminderAssignment_nextDueAt_id_idx" ON "TelegramChannelReminderAssignment"("nextDueAt", "id");
CREATE INDEX "TelegramChannelReminderAssignment_workspaceId_templateId_idx" ON "TelegramChannelReminderAssignment"("workspaceId", "templateId");
