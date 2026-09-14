ALTER TYPE "TelegramSystemBotWorkflowKind" ADD VALUE 'POST_BATCH_IMPORT';

CREATE TYPE "TelegramPostBatchStatus" AS ENUM (
  'DRAFT',
  'DISPATCHING',
  'ACTIVE',
  'COMPLETED',
  'PARTIAL_FAILURE',
  'CANCELLED'
);

CREATE TYPE "TelegramPostBatchAction" AS ENUM ('PUBLISH_NOW', 'SCHEDULE');

CREATE TYPE "TelegramPostBatchDeliveryStatus" AS ENUM (
  'SCHEDULED',
  'PUBLISHING',
  'PUBLISHED',
  'DELETING',
  'DELETED',
  'FAILED',
  'DELETE_FAILED',
  'CANCELLED'
);

CREATE TABLE "TelegramPostBatch" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "createdByMemberId" TEXT NOT NULL,
  "sourceWorkflowId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" "TelegramPostBatchStatus" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 0,
  "channelIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "defaultDeleteAfterHours" INTEGER DEFAULT 24,
  "dispatchedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramPostBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramPostBatchPost" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "text" TEXT,
  "imageUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "mediaItems" JSONB NOT NULL DEFAULT '[]',
  "buttonRows" JSONB NOT NULL DEFAULT '[]',
  "action" "TelegramPostBatchAction" NOT NULL DEFAULT 'PUBLISH_NOW',
  "scheduledAt" TIMESTAMP(3),
  "deleteAfterHours" INTEGER DEFAULT 24,
  "longTextMode" TEXT NOT NULL DEFAULT 'IMAGES_THEN_TEXT',
  "channelOverrides" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramPostBatchPost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramPostBatchDelivery" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "batchPostId" TEXT NOT NULL,
  "telegramChannelId" TEXT NOT NULL,
  "managedPostId" TEXT NOT NULL,
  "action" "TelegramPostBatchAction" NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "deleteAfterHours" INTEGER,
  "longTextMode" TEXT NOT NULL DEFAULT 'IMAGES_THEN_TEXT',
  "status" "TelegramPostBatchDeliveryStatus" NOT NULL DEFAULT 'SCHEDULED',
  "publishedAt" TIMESTAMP(3),
  "deleteAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3),
  "claimOwner" TEXT,
  "claimExpiresAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramPostBatchDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramPostBatchAdSaleLink" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "adSaleId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramPostBatchAdSaleLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramPostBatchMutualPromotionLink" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "mutualPromotionFolderId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramPostBatchMutualPromotionLink_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TelegramPostBatch"
  ADD CONSTRAINT "TelegramPostBatch_defaultDeleteAfterHours_check"
  CHECK ("defaultDeleteAfterHours" IS NULL OR "defaultDeleteAfterHours" IN (24, 48, 72));

ALTER TABLE "TelegramPostBatchPost"
  ADD CONSTRAINT "TelegramPostBatchPost_deleteAfterHours_check"
  CHECK ("deleteAfterHours" IS NULL OR "deleteAfterHours" IN (24, 48, 72)),
  ADD CONSTRAINT "TelegramPostBatchPost_longTextMode_check"
  CHECK ("longTextMode" IN ('IMAGES_THEN_TEXT', 'CAPTION_THEN_TEXT')),
  ADD CONSTRAINT "TelegramPostBatchPost_schedule_check"
  CHECK ("action" = 'PUBLISH_NOW' OR "scheduledAt" IS NOT NULL);

ALTER TABLE "TelegramPostBatchDelivery"
  ADD CONSTRAINT "TelegramPostBatchDelivery_deleteAfterHours_check"
  CHECK ("deleteAfterHours" IS NULL OR "deleteAfterHours" IN (24, 48, 72)),
  ADD CONSTRAINT "TelegramPostBatchDelivery_longTextMode_check"
  CHECK ("longTextMode" IN ('IMAGES_THEN_TEXT', 'CAPTION_THEN_TEXT'));

CREATE UNIQUE INDEX "TelegramPostBatch_sourceWorkflowId_key" ON "TelegramPostBatch"("sourceWorkflowId");
CREATE INDEX "TelegramPostBatch_workspace_updated_idx" ON "TelegramPostBatch"("workspaceId", "updatedAt", "id");
CREATE INDEX "TelegramPostBatch_workspace_status_idx" ON "TelegramPostBatch"("workspaceId", "status", "updatedAt");
CREATE INDEX "TelegramPostBatch_status_updated_idx" ON "TelegramPostBatch"("status", "updatedAt", "id");
CREATE UNIQUE INDEX "TelegramPostBatchPost_batch_position_key" ON "TelegramPostBatchPost"("batchId", "position");
CREATE INDEX "TelegramPostBatchPost_workspace_batch_idx" ON "TelegramPostBatchPost"("workspaceId", "batchId");
CREATE UNIQUE INDEX "TelegramPostBatchDelivery_managedPostId_key" ON "TelegramPostBatchDelivery"("managedPostId");
CREATE UNIQUE INDEX "TelegramPostBatchDelivery_post_channel_key" ON "TelegramPostBatchDelivery"("batchPostId", "telegramChannelId");
CREATE INDEX "TelegramPostBatchDelivery_workspace_batch_idx" ON "TelegramPostBatchDelivery"("workspaceId", "batchId");
CREATE INDEX "TelegramPostBatchDelivery_batch_status_idx" ON "TelegramPostBatchDelivery"("batchId", "status");
CREATE INDEX "TelegramPostBatchDelivery_due_publish_idx" ON "TelegramPostBatchDelivery"("status", "nextAttemptAt", "id");
CREATE INDEX "TelegramPostBatchDelivery_due_delete_idx" ON "TelegramPostBatchDelivery"("status", "deleteAt", "id");
CREATE INDEX "TelegramPostBatchDelivery_claim_expiry_idx" ON "TelegramPostBatchDelivery"("claimExpiresAt");
CREATE UNIQUE INDEX "TelegramPostBatchAdSaleLink_batch_sale_key" ON "TelegramPostBatchAdSaleLink"("batchId", "adSaleId");
CREATE INDEX "TelegramPostBatchAdSaleLink_workspace_sale_idx" ON "TelegramPostBatchAdSaleLink"("workspaceId", "adSaleId");
CREATE UNIQUE INDEX "TelegramPostBatchMutualPromotionLink_batch_folder_key" ON "TelegramPostBatchMutualPromotionLink"("batchId", "mutualPromotionFolderId");
CREATE INDEX "TelegramPostBatchMutualPromotionLink_workspace_folder_idx" ON "TelegramPostBatchMutualPromotionLink"("workspaceId", "mutualPromotionFolderId");

ALTER TABLE "TelegramPostBatch"
  ADD CONSTRAINT "TelegramPostBatch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TelegramPostBatch_createdByMember_fkey" FOREIGN KEY ("createdByMemberId", "workspaceId") REFERENCES "WorkspaceMember"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TelegramPostBatch_sourceWorkflowId_fkey" FOREIGN KEY ("sourceWorkflowId") REFERENCES "TelegramSystemBotWorkflow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TelegramPostBatchPost"
  ADD CONSTRAINT "TelegramPostBatchPost_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TelegramPostBatchPost_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "TelegramPostBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramPostBatchDelivery"
  ADD CONSTRAINT "TelegramPostBatchDelivery_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TelegramPostBatchDelivery_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "TelegramPostBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TelegramPostBatchDelivery_batchPostId_fkey" FOREIGN KEY ("batchPostId") REFERENCES "TelegramPostBatchPost"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TelegramPostBatchDelivery_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TelegramPostBatchDelivery_managedPostId_fkey" FOREIGN KEY ("managedPostId") REFERENCES "TelegramManagedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramPostBatchAdSaleLink"
  ADD CONSTRAINT "TelegramPostBatchAdSaleLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TelegramPostBatchAdSaleLink_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "TelegramPostBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TelegramPostBatchAdSaleLink_adSaleId_fkey" FOREIGN KEY ("adSaleId") REFERENCES "TelegramAdSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramPostBatchMutualPromotionLink"
  ADD CONSTRAINT "TelegramPostBatchMutualPromotionLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TelegramPostBatchMutualPromotionLink_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "TelegramPostBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TelegramPostBatchMutualPromotionLink_folderId_fkey" FOREIGN KEY ("mutualPromotionFolderId") REFERENCES "MutualPromotionFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
