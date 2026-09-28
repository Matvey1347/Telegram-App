-- Archived accounts retain their transactions and transfers. The composite
-- index serves the Finance account tabs without a workspace-wide scan.
CREATE INDEX "Account_workspaceId_isActive_assignedMemberId_idx"
  ON "Account"("workspaceId", "isActive", "assignedMemberId");
