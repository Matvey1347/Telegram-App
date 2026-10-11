ALTER TABLE "Account" ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Account"
SET "isSystem" = true, "assignedMemberId" = NULL
WHERE lower("name") IN ('telega.io', 'adsell.io');

CREATE INDEX "Account_workspaceId_isSystem_isActive_idx"
ON "Account"("workspaceId", "isSystem", "isActive");
