-- Role icons reuse the workspace icon library. Application validation requires
-- the selected icon to belong to the same workspace as the role.
ALTER TABLE "WorkspaceRoleDefinition" ADD COLUMN "iconId" TEXT;

CREATE INDEX "WorkspaceRoleDefinition_workspaceId_iconId_idx"
ON "WorkspaceRoleDefinition"("workspaceId", "iconId");

ALTER TABLE "WorkspaceRoleDefinition"
ADD CONSTRAINT "WorkspaceRoleDefinition_iconId_fkey"
FOREIGN KEY ("iconId") REFERENCES "Icon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Future workspaces only receive the immutable Owner definition. Product roles
-- are tenant configuration and must be created explicitly by an owner.
CREATE OR REPLACE FUNCTION create_workspace_owner_role() RETURNS trigger AS $$
BEGIN
  INSERT INTO "WorkspaceRoleDefinition" ("id", "workspaceId", "name", "description", "emoji", "mode", "version", "systemKey", "updatedAt")
  VALUES ('wr_' || md5(NEW."id" || ':owner'), NEW."id", 'Owner', 'Workspace owner with full access', '👑', 'DENYLIST', 1, 'OWNER', CURRENT_TIMESTAMP);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Legacy membership enums remain for compatibility, but no longer materialize
-- editable default roles. Only owners are forced onto the Owner definition.
CREATE OR REPLACE FUNCTION enforce_workspace_owner_role_assignment() RETURNS trigger AS $$
BEGIN
  IF NEW."role"::text = 'owner' THEN
    NEW."roleDefinitionId" := 'wr_' || md5(NEW."workspaceId" || ':owner');
  ELSIF TG_OP = 'UPDATE' AND OLD."role"::text = 'owner' THEN
    NEW."roleDefinitionId" := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Delete only deterministic definitions created by the original RBAC migration.
-- Custom roles are preserved even when they reuse a legacy display name.
UPDATE "WorkspaceMember" m
SET "roleDefinitionId" = NULL
WHERE m."roleDefinitionId" IN (
  'wr_' || md5(m."workspaceId" || ':admin'),
  'wr_' || md5(m."workspaceId" || ':media-buyer'),
  'wr_' || md5(m."workspaceId" || ':member')
);

DELETE FROM "WorkspaceRoleDefinition" r
WHERE r."systemKey" IS NULL
  AND r."id" IN (
    'wr_' || md5(r."workspaceId" || ':admin'),
    'wr_' || md5(r."workspaceId" || ':media-buyer'),
    'wr_' || md5(r."workspaceId" || ':member')
  );
