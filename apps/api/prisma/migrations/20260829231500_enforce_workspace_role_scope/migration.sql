ALTER TABLE "WorkspaceMember"
  DROP CONSTRAINT "WorkspaceMember_roleDefinitionId_fkey";

CREATE UNIQUE INDEX "WorkspaceRoleDefinition_id_workspaceId_key"
  ON "WorkspaceRoleDefinition"("id", "workspaceId");

ALTER TABLE "WorkspaceMember"
  ADD CONSTRAINT "WorkspaceMember_roleDefinitionId_workspaceId_fkey"
  FOREIGN KEY ("roleDefinitionId", "workspaceId")
  REFERENCES "WorkspaceRoleDefinition"("id", "workspaceId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
