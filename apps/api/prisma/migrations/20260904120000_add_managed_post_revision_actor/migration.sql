ALTER TABLE "TelegramManagedPostRevision"
ADD COLUMN "actorMemberId" TEXT;

ALTER TABLE "TelegramManagedPostRevision"
ADD CONSTRAINT "TelegramManagedPostRevision_actorMemberId_fkey"
FOREIGN KEY ("actorMemberId") REFERENCES "WorkspaceMember"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "TelegramManagedPostRevision_workspaceId_actorMemberId_createdAt_idx"
ON "TelegramManagedPostRevision"("workspaceId", "actorMemberId", "createdAt");
