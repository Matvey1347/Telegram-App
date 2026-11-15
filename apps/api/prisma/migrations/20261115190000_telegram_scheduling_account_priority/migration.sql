ALTER TYPE "CrossPromotionPlanStatus" ADD VALUE IF NOT EXISTS 'RESCHEDULING';

ALTER TABLE "TelegramUserAccountIntegration"
ADD COLUMN "isPriorityPublisher" BOOLEAN NOT NULL DEFAULT false;

UPDATE "TelegramUserAccountIntegration"
SET "isPriorityPublisher" = true
WHERE lower(ltrim(coalesce("username", ''), '@')) = 'tgmanage770'
  AND "isActive" = true
  AND "mtprotoPublishingEnabled" = true
  AND "status" = 'connected';

CREATE UNIQUE INDEX "TelegramUserAccountIntegration_single_priority_publisher_idx"
  ON "TelegramUserAccountIntegration"("workspaceId")
  WHERE "isPriorityPublisher" = true;
