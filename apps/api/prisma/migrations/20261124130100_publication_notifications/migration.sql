ALTER TABLE "Workspace"
  ADD COLUMN "publicationNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "publicationNotificationExcludedChannelIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "publicationNotificationDueAt" TIMESTAMP(3);

UPDATE "Workspace" AS workspace
SET "publicationNotificationsEnabled" = true,
    "publicationNotificationDueAt" = date_trunc('minute', CURRENT_TIMESTAMP) + interval '1 day'
WHERE EXISTS (
  SELECT 1 FROM "TelegramChannelReminderAssignment" AS assignment
  JOIN "TelegramChannel" AS channel ON channel.id = assignment."channelId"
  WHERE assignment."workspaceId" = workspace.id AND channel."workspaceId" = workspace.id
    AND channel."isActive" AND channel."archivedAt" IS NULL
    AND channel."assignedMemberId" IS NOT NULL
);

CREATE INDEX "Workspace_publicationNotificationDueAt_idx"
  ON "Workspace"("publicationNotificationDueAt");
