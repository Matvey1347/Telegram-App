ALTER TYPE "TelegramSystemBotWorkflowKind" ADD VALUE IF NOT EXISTS 'MUTUAL_PROMOTION_POST';

CREATE TYPE "MutualPromotionFolderStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'DELETING', 'COMPLETED', 'CANCELLED');
CREATE TYPE "MutualPromotionParticipantRole" AS ENUM ('PUBLISHER', 'PAID');
CREATE TYPE "MutualPromotionInviteLinkMode" AS ENUM ('FOLDER_ONLY', 'REUSABLE');
CREATE TYPE "MutualPromotionDeliveryStatus" AS ENUM ('PENDING', 'PUBLISHING', 'PUBLISHED', 'DELETING', 'DELETED', 'FAILED', 'SKIPPED');
CREATE TYPE "MutualPromotionWorkKind" AS ENUM ('CAPTURE_START_BASELINE', 'PUBLISH_POST', 'FINISH_FOLDER');
CREATE TYPE "MutualPromotionWorkStatus" AS ENUM ('PENDING', 'PROCESSING', 'RETRY', 'COMPLETED', 'FAILED', 'CANCELLED');

CREATE TABLE "MutualPromotionFolder" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" "MutualPromotionFolderStatus" NOT NULL DEFAULT 'DRAFT',
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "timezone" TEXT NOT NULL,
  "notes" TEXT,
  "assignedMemberId" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "activatedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "nextDueAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MutualPromotionFolder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MutualPromotionFolderParticipant" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "folderId" TEXT NOT NULL,
  "telegramChannelId" TEXT NOT NULL,
  "inviteLinkId" TEXT NOT NULL,
  "role" "MutualPromotionParticipantRole" NOT NULL,
  "inviteLinkMode" "MutualPromotionInviteLinkMode" NOT NULL,
  "subscribersAtStart" INTEGER,
  "subscribersAtEnd" INTEGER,
  "inviteJoinedAtStart" INTEGER,
  "inviteJoinedAtEnd" INTEGER,
  "baselineCapturedAt" TIMESTAMP(3),
  "finalCapturedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MutualPromotionFolderParticipant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MutualPromotionFolderPost" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "folderId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "text" TEXT,
  "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "buttonRows" JSONB,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MutualPromotionFolderPost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MutualPromotionPostDelivery" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "folderPostId" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "telegramChannelId" TEXT NOT NULL,
  "managedPostId" TEXT,
  "status" "MutualPromotionDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "publishedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MutualPromotionPostDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MutualPromotionWorkItem" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "folderId" TEXT NOT NULL,
  "folderPostId" TEXT,
  "kind" "MutualPromotionWorkKind" NOT NULL,
  "status" "MutualPromotionWorkStatus" NOT NULL DEFAULT 'PENDING',
  "idempotencyKey" TEXT NOT NULL,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 8,
  "claimedAt" TIMESTAMP(3),
  "leaseExpiresAt" TIMESTAMP(3),
  "lastError" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MutualPromotionWorkItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Transaction" ADD COLUMN "mutualPromotionParticipantId" TEXT;
ALTER TABLE "TelegramSystemBotWorkflow" ADD COLUMN "mutualPromotionFolderId" TEXT;
ALTER TABLE "TelegramSystemBotWorkflow" ADD COLUMN "resultMutualPromotionPostId" TEXT;

CREATE UNIQUE INDEX "MutualPromotionFolderParticipant_folder_channel_key" ON "MutualPromotionFolderParticipant"("folderId", "telegramChannelId");
CREATE UNIQUE INDEX "MutualPromotionFolderParticipant_folder_invite_key" ON "MutualPromotionFolderParticipant"("folderId", "inviteLinkId");
CREATE UNIQUE INDEX "MutualPromotionFolderParticipant_folder_only_invite_key" ON "MutualPromotionFolderParticipant"("inviteLinkId") WHERE "inviteLinkMode" = 'FOLDER_ONLY';
CREATE INDEX "MutualPromotionFolderParticipant_workspace_channel_idx" ON "MutualPromotionFolderParticipant"("workspaceId", "telegramChannelId");
CREATE INDEX "MutualPromotionFolderParticipant_workspace_invite_idx" ON "MutualPromotionFolderParticipant"("workspaceId", "inviteLinkId");
CREATE UNIQUE INDEX "MutualPromotionFolderPost_folder_position_key" ON "MutualPromotionFolderPost"("folderId", "position");
CREATE INDEX "MutualPromotionFolderPost_workspace_scheduled_idx" ON "MutualPromotionFolderPost"("workspaceId", "scheduledAt");
CREATE UNIQUE INDEX "MutualPromotionPostDelivery_managedPostId_key" ON "MutualPromotionPostDelivery"("managedPostId");
CREATE UNIQUE INDEX "MutualPromotionPostDelivery_post_participant_key" ON "MutualPromotionPostDelivery"("folderPostId", "participantId");
CREATE INDEX "MutualPromotionPostDelivery_workspace_status_idx" ON "MutualPromotionPostDelivery"("workspaceId", "status", "updatedAt");
CREATE INDEX "MutualPromotionPostDelivery_participant_status_idx" ON "MutualPromotionPostDelivery"("participantId", "status");
CREATE UNIQUE INDEX "MutualPromotionWorkItem_idempotencyKey_key" ON "MutualPromotionWorkItem"("idempotencyKey");
CREATE INDEX "MutualPromotionWorkItem_due_idx" ON "MutualPromotionWorkItem"("status", "nextAttemptAt", "id");
CREATE INDEX "MutualPromotionWorkItem_folder_status_idx" ON "MutualPromotionWorkItem"("folderId", "status", "dueAt");
CREATE INDEX "MutualPromotionWorkItem_workspace_due_idx" ON "MutualPromotionWorkItem"("workspaceId", "status", "nextAttemptAt");
CREATE INDEX "MutualPromotionFolder_workspace_status_idx" ON "MutualPromotionFolder"("workspaceId", "status", "startsAt", "id");
CREATE INDEX "MutualPromotionFolder_due_idx" ON "MutualPromotionFolder"("status", "nextDueAt", "id");
CREATE INDEX "MutualPromotionFolder_workspace_assignee_idx" ON "MutualPromotionFolder"("workspaceId", "assignedMemberId");
CREATE UNIQUE INDEX "Transaction_mutualPromotionParticipantId_key" ON "Transaction"("mutualPromotionParticipantId");
CREATE UNIQUE INDEX "TelegramSystemBotWorkflow_resultMutualPromotionPostId_key" ON "TelegramSystemBotWorkflow"("resultMutualPromotionPostId");
CREATE INDEX "TelegramSystemBotWorkflow_mutual_promotion_idx" ON "TelegramSystemBotWorkflow"("workspaceId", "mutualPromotionFolderId", "status");

ALTER TABLE "MutualPromotionFolder" ADD CONSTRAINT "MutualPromotionFolder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MutualPromotionFolder" ADD CONSTRAINT "MutualPromotionFolder_assignedMember_fkey" FOREIGN KEY ("assignedMemberId", "workspaceId") REFERENCES "WorkspaceMember"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MutualPromotionFolder" ADD CONSTRAINT "MutualPromotionFolder_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MutualPromotionFolderParticipant" ADD CONSTRAINT "MutualPromotionFolderParticipant_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MutualPromotionFolderParticipant" ADD CONSTRAINT "MutualPromotionFolderParticipant_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "MutualPromotionFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MutualPromotionFolderParticipant" ADD CONSTRAINT "MutualPromotionFolderParticipant_channelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MutualPromotionFolderParticipant" ADD CONSTRAINT "MutualPromotionFolderParticipant_inviteLinkId_fkey" FOREIGN KEY ("inviteLinkId") REFERENCES "TelegramInviteLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MutualPromotionFolderPost" ADD CONSTRAINT "MutualPromotionFolderPost_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MutualPromotionFolderPost" ADD CONSTRAINT "MutualPromotionFolderPost_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "MutualPromotionFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MutualPromotionPostDelivery" ADD CONSTRAINT "MutualPromotionPostDelivery_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MutualPromotionPostDelivery" ADD CONSTRAINT "MutualPromotionPostDelivery_folderPostId_fkey" FOREIGN KEY ("folderPostId") REFERENCES "MutualPromotionFolderPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MutualPromotionPostDelivery" ADD CONSTRAINT "MutualPromotionPostDelivery_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "MutualPromotionFolderParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MutualPromotionPostDelivery" ADD CONSTRAINT "MutualPromotionPostDelivery_channelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MutualPromotionPostDelivery" ADD CONSTRAINT "MutualPromotionPostDelivery_managedPostId_fkey" FOREIGN KEY ("managedPostId") REFERENCES "TelegramManagedPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MutualPromotionWorkItem" ADD CONSTRAINT "MutualPromotionWorkItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MutualPromotionWorkItem" ADD CONSTRAINT "MutualPromotionWorkItem_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "MutualPromotionFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MutualPromotionWorkItem" ADD CONSTRAINT "MutualPromotionWorkItem_folderPostId_fkey" FOREIGN KEY ("folderPostId") REFERENCES "MutualPromotionFolderPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_mutualPromotionParticipantId_fkey" FOREIGN KEY ("mutualPromotionParticipantId") REFERENCES "MutualPromotionFolderParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TelegramSystemBotWorkflow" ADD CONSTRAINT "TelegramSystemBotWorkflow_mutualPromotionFolderId_fkey" FOREIGN KEY ("mutualPromotionFolderId") REFERENCES "MutualPromotionFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TelegramSystemBotWorkflow" ADD CONSTRAINT "TelegramSystemBotWorkflow_resultMutualPromotionPostId_fkey" FOREIGN KEY ("resultMutualPromotionPostId") REFERENCES "MutualPromotionFolderPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill the system group for every channel. The group owns only local
-- metadata; no Telegram request or recurring runtime work is created here.
INSERT INTO "PostGroup" (
  "id", "workspaceId", "telegramChannelId", "title", "icon", "isSystem",
  "systemKey", "statusNumberingEnabled", "createdByMemberId", "createdAt", "updatedAt"
)
SELECT
  'mutual-promotion-' || MD5(channel_row."id"),
  channel_row."workspaceId",
  channel_row."id",
  'Mutual promotion',
  '🤝',
  TRUE,
  'MUTUAL_PROMOTION',
  FALSE,
  creator."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "TelegramChannel" channel_row
JOIN LATERAL (
  SELECT member."id"
  FROM "WorkspaceMember" member
  WHERE member."workspaceId" = channel_row."workspaceId"
  ORDER BY CASE WHEN member."id" = channel_row."assignedMemberId" THEN 0 ELSE 1 END,
           member."createdAt" ASC, member."id" ASC
  LIMIT 1
) creator ON TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM "PostGroup" existing_system
  WHERE existing_system."telegramChannelId" = channel_row."id"
    AND existing_system."systemKey" = 'MUTUAL_PROMOTION'
);
