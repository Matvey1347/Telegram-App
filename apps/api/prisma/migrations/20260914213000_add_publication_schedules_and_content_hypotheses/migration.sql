CREATE TYPE "TelegramPublicationSlotKind" AS ENUM ('CONTENT', 'AD', 'MUTUAL_PROMOTION');
CREATE TYPE "TelegramPublicationScheduleSelectionMode" AS ENUM ('FULL', 'SUBSET');
CREATE TYPE "TelegramContentHypothesisStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUCCESSFUL', 'FAILED', 'ARCHIVED');

CREATE TABLE "TelegramPublicationSchedule" ("id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL, "timezone" TEXT NOT NULL, "isDefault" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "TelegramPublicationSchedule_pkey" PRIMARY KEY ("id"));
CREATE TABLE "TelegramPublicationScheduleSlot" ("id" TEXT NOT NULL, "scheduleId" TEXT NOT NULL, "title" TEXT NOT NULL, "kind" "TelegramPublicationSlotKind" NOT NULL, "weekday" INTEGER NOT NULL, "time" VARCHAR(5) NOT NULL, "timezone" TEXT NOT NULL, "position" INTEGER NOT NULL DEFAULT 0, "isActive" BOOLEAN NOT NULL DEFAULT true, "iconId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "TelegramPublicationScheduleSlot_pkey" PRIMARY KEY ("id"));
CREATE TABLE "TelegramChannelPublicationScheduleAssignment" ("id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "channelId" TEXT NOT NULL, "scheduleId" TEXT NOT NULL, "selectionMode" "TelegramPublicationScheduleSelectionMode" NOT NULL DEFAULT 'FULL', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "TelegramChannelPublicationScheduleAssignment_pkey" PRIMARY KEY ("id"));
CREATE TABLE "TelegramChannelPublicationScheduleSelectedSlot" ("assignmentId" TEXT NOT NULL, "slotId" TEXT NOT NULL, CONSTRAINT "TelegramChannelPublicationScheduleSelectedSlot_pkey" PRIMARY KEY ("assignmentId", "slotId"));
CREATE TABLE "TelegramContentHypothesis" ("id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "telegramChannelId" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT, "status" "TelegramContentHypothesisStatus" NOT NULL DEFAULT 'DRAFT', "iconId" TEXT, "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3), "conclusion" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "TelegramContentHypothesis_pkey" PRIMARY KEY ("id"));
CREATE TABLE "TelegramManagedPostContentHypothesis" ("managedPostId" TEXT NOT NULL, "hypothesisId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "TelegramManagedPostContentHypothesis_pkey" PRIMARY KEY ("managedPostId", "hypothesisId"));
ALTER TABLE "TelegramManagedPost" ADD COLUMN "publicationSlotId" TEXT;

CREATE INDEX "TelegramPublicationSchedule_workspaceId_createdAt_idx" ON "TelegramPublicationSchedule"("workspaceId", "createdAt");
CREATE INDEX "TelegramPublicationSchedule_workspaceId_isDefault_idx" ON "TelegramPublicationSchedule"("workspaceId", "isDefault");
CREATE INDEX "TelegramPublicationScheduleSlot_scheduleId_weekday_position_idx" ON "TelegramPublicationScheduleSlot"("scheduleId", "weekday", "position");
CREATE INDEX "TelegramPublicationScheduleSlot_iconId_idx" ON "TelegramPublicationScheduleSlot"("iconId");
CREATE UNIQUE INDEX "TelegramChannelPublicationScheduleAssignment_channelId_key" ON "TelegramChannelPublicationScheduleAssignment"("channelId");
CREATE INDEX "TelegramChannelPublicationScheduleAssignment_workspaceId_scheduleId_idx" ON "TelegramChannelPublicationScheduleAssignment"("workspaceId", "scheduleId");
CREATE INDEX "TelegramChannelPublicationScheduleSelectedSlot_slotId_idx" ON "TelegramChannelPublicationScheduleSelectedSlot"("slotId");
CREATE INDEX "TelegramContentHypothesis_workspaceId_telegramChannelId_status_idx" ON "TelegramContentHypothesis"("workspaceId", "telegramChannelId", "status");
CREATE INDEX "TelegramContentHypothesis_iconId_idx" ON "TelegramContentHypothesis"("iconId");
CREATE INDEX "TelegramManagedPostContentHypothesis_hypothesisId_idx" ON "TelegramManagedPostContentHypothesis"("hypothesisId");
CREATE INDEX "TelegramManagedPost_workspaceId_telegramChannelId_publicationSlotId_idx" ON "TelegramManagedPost"("workspaceId", "telegramChannelId", "publicationSlotId");

ALTER TABLE "TelegramPublicationSchedule" ADD CONSTRAINT "TelegramPublicationSchedule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramPublicationScheduleSlot" ADD CONSTRAINT "TelegramPublicationScheduleSlot_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "TelegramPublicationSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramPublicationScheduleSlot" ADD CONSTRAINT "TelegramPublicationScheduleSlot_iconId_fkey" FOREIGN KEY ("iconId") REFERENCES "Icon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TelegramChannelPublicationScheduleAssignment" ADD CONSTRAINT "TelegramChannelPublicationScheduleAssignment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramChannelPublicationScheduleAssignment" ADD CONSTRAINT "TelegramChannelPublicationScheduleAssignment_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramChannelPublicationScheduleAssignment" ADD CONSTRAINT "TelegramChannelPublicationScheduleAssignment_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "TelegramPublicationSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramChannelPublicationScheduleSelectedSlot" ADD CONSTRAINT "TelegramChannelPublicationScheduleSelectedSlot_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "TelegramChannelPublicationScheduleAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramChannelPublicationScheduleSelectedSlot" ADD CONSTRAINT "TelegramChannelPublicationScheduleSelectedSlot_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "TelegramPublicationScheduleSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramContentHypothesis" ADD CONSTRAINT "TelegramContentHypothesis_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramContentHypothesis" ADD CONSTRAINT "TelegramContentHypothesis_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramContentHypothesis" ADD CONSTRAINT "TelegramContentHypothesis_iconId_fkey" FOREIGN KEY ("iconId") REFERENCES "Icon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TelegramManagedPostContentHypothesis" ADD CONSTRAINT "TelegramManagedPostContentHypothesis_managedPostId_fkey" FOREIGN KEY ("managedPostId") REFERENCES "TelegramManagedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramManagedPostContentHypothesis" ADD CONSTRAINT "TelegramManagedPostContentHypothesis_hypothesisId_fkey" FOREIGN KEY ("hypothesisId") REFERENCES "TelegramContentHypothesis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramManagedPost" ADD CONSTRAINT "TelegramManagedPost_publicationSlotId_fkey" FOREIGN KEY ("publicationSlotId") REFERENCES "TelegramPublicationScheduleSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve every legacy per-channel publication time. A time applied to all
-- weekdays becomes seven explicit slots because the legacy model had no
-- weekday dimension. The old table intentionally remains for rollback.
INSERT INTO "TelegramPublicationSchedule" ("id", "workspaceId", "name", "timezone", "isDefault", "createdAt", "updatedAt")
SELECT 'legacy-schedule-' || c."id", c."workspaceId", c."title" || ' legacy schedule', COALESCE(NULLIF(w."timezone", ''), 'UTC'), false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "TelegramChannel" c
JOIN "Workspace" w ON w."id" = c."workspaceId"
WHERE EXISTS (SELECT 1 FROM "TelegramChannelTimePost" tp WHERE tp."telegramChannelId" = c."id");

INSERT INTO "TelegramPublicationScheduleSlot" ("id", "scheduleId", "title", "kind", "weekday", "time", "timezone", "position", "isActive", "iconId", "createdAt", "updatedAt")
SELECT 'legacy-slot-' || tp."id" || '-' || day."weekday", 'legacy-schedule-' || c."id", tp."title", 'CONTENT'::"TelegramPublicationSlotKind", day."weekday", tp."time", COALESCE(NULLIF(w."timezone", ''), 'UTC'), tp."position" * 7 + day."weekday", true, tp."iconId", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "TelegramChannelTimePost" tp
JOIN "TelegramChannel" c ON c."id" = tp."telegramChannelId"
JOIN "Workspace" w ON w."id" = c."workspaceId"
CROSS JOIN generate_series(1, 7) AS day("weekday");

INSERT INTO "TelegramChannelPublicationScheduleAssignment" ("id", "workspaceId", "channelId", "scheduleId", "selectionMode", "createdAt", "updatedAt")
SELECT 'legacy-assignment-' || c."id", c."workspaceId", c."id", 'legacy-schedule-' || c."id", 'FULL'::"TelegramPublicationScheduleSelectionMode", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "TelegramChannel" c
WHERE EXISTS (SELECT 1 FROM "TelegramChannelTimePost" tp WHERE tp."telegramChannelId" = c."id");
