CREATE TYPE "WorkspaceRoleMode" AS ENUM ('ALLOWLIST', 'DENYLIST');
CREATE TYPE "WorkspaceRolePermissionEffect" AS ENUM ('ALLOW', 'DENY');

CREATE TABLE "WorkspaceRoleDefinition" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "emoji" TEXT,
    "mode" "WorkspaceRoleMode" NOT NULL DEFAULT 'ALLOWLIST',
    "version" INTEGER NOT NULL DEFAULT 1,
    "systemKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkspaceRoleDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkspaceRolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "effect" "WorkspaceRolePermissionEffect" NOT NULL,
    CONSTRAINT "WorkspaceRolePermission_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WorkspaceMember" ADD COLUMN "roleDefinitionId" TEXT;

CREATE UNIQUE INDEX "WorkspaceRoleDefinition_workspaceId_name_key" ON "WorkspaceRoleDefinition"("workspaceId", "name");
CREATE UNIQUE INDEX "WorkspaceRoleDefinition_workspaceId_systemKey_key" ON "WorkspaceRoleDefinition"("workspaceId", "systemKey");
CREATE INDEX "WorkspaceRoleDefinition_workspaceId_updatedAt_idx" ON "WorkspaceRoleDefinition"("workspaceId", "updatedAt");
CREATE UNIQUE INDEX "WorkspaceRolePermission_roleId_permissionKey_key" ON "WorkspaceRolePermission"("roleId", "permissionKey");
CREATE INDEX "WorkspaceRolePermission_permissionKey_idx" ON "WorkspaceRolePermission"("permissionKey");
CREATE INDEX "WorkspaceMember_workspaceId_roleDefinitionId_idx" ON "WorkspaceMember"("workspaceId", "roleDefinitionId");

ALTER TABLE "WorkspaceRoleDefinition" ADD CONSTRAINT "WorkspaceRoleDefinition_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceRolePermission" ADD CONSTRAINT "WorkspaceRolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "WorkspaceRoleDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_roleDefinitionId_fkey" FOREIGN KEY ("roleDefinitionId") REFERENCES "WorkspaceRoleDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION create_workspace_owner_role() RETURNS trigger AS $$
BEGIN
  INSERT INTO "WorkspaceRoleDefinition" ("id", "workspaceId", "name", "description", "emoji", "mode", "version", "systemKey", "updatedAt")
  VALUES ('wr_' || md5(NEW."id" || ':owner'), NEW."id", 'Owner', 'Workspace owner with full access', '👑', 'DENYLIST', 1, 'OWNER', CURRENT_TIMESTAMP);
  INSERT INTO "WorkspaceRoleDefinition" ("id", "workspaceId", "name", "description", "emoji", "mode", "version", "systemKey", "updatedAt")
  VALUES ('wr_' || md5(NEW."id" || ':admin'), NEW."id", 'Admin', 'Full workspace access', '🛡️', 'DENYLIST', 1, NULL, CURRENT_TIMESTAMP);
  INSERT INTO "WorkspaceRoleDefinition" ("id", "workspaceId", "name", "description", "emoji", "mode", "version", "systemKey", "updatedAt")
  VALUES ('wr_' || md5(NEW."id" || ':media-buyer'), NEW."id", 'Media buyer', 'Legacy media buyer role', '📣', 'DENYLIST', 1, NULL, CURRENT_TIMESTAMP);
  INSERT INTO "WorkspaceRoleDefinition" ("id", "workspaceId", "name", "description", "emoji", "mode", "version", "systemKey", "updatedAt")
  VALUES ('wr_' || md5(NEW."id" || ':member'), NEW."id", 'Member', 'Legacy workspace member role', '👤', 'DENYLIST', 1, NULL, CURRENT_TIMESTAMP);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Workspace_create_owner_role"
AFTER INSERT ON "Workspace"
FOR EACH ROW EXECUTE FUNCTION create_workspace_owner_role();

CREATE FUNCTION enforce_workspace_owner_role_assignment() RETURNS trigger AS $$
BEGIN
  IF NEW."role"::text = 'owner' THEN
    NEW."roleDefinitionId" := 'wr_' || md5(NEW."workspaceId" || ':owner');
  ELSIF NEW."roleDefinitionId" IS NULL THEN
    NEW."roleDefinitionId" := CASE NEW."role"::text
      WHEN 'admin' THEN 'wr_' || md5(NEW."workspaceId" || ':admin')
      WHEN 'MEDIA_BUYER' THEN 'wr_' || md5(NEW."workspaceId" || ':media-buyer')
      ELSE 'wr_' || md5(NEW."workspaceId" || ':member')
    END;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD."role" IS DISTINCT FROM NEW."role"
      AND NEW."roleDefinitionId" IS NOT DISTINCT FROM OLD."roleDefinitionId" THEN
      NEW."roleDefinitionId" := CASE NEW."role"::text
        WHEN 'admin' THEN 'wr_' || md5(NEW."workspaceId" || ':admin')
        WHEN 'MEDIA_BUYER' THEN 'wr_' || md5(NEW."workspaceId" || ':media-buyer')
        ELSE 'wr_' || md5(NEW."workspaceId" || ':member')
      END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "WorkspaceMember_enforce_owner_role"
BEFORE INSERT OR UPDATE OF "role", "workspaceId" ON "WorkspaceMember"
FOR EACH ROW EXECUTE FUNCTION enforce_workspace_owner_role_assignment();

-- Every workspace receives one immutable Owner role. Legacy non-owner roles are
-- materialized as editable definitions so current memberships keep their shape.
INSERT INTO "WorkspaceRoleDefinition" ("id", "workspaceId", "name", "description", "emoji", "mode", "version", "systemKey", "updatedAt")
SELECT 'wr_' || md5(w."id" || ':owner'), w."id", 'Owner', 'Workspace owner with full access', '👑', 'DENYLIST', 1, 'OWNER', CURRENT_TIMESTAMP
FROM "Workspace" w;

INSERT INTO "WorkspaceRoleDefinition" ("id", "workspaceId", "name", "description", "emoji", "mode", "version", "systemKey", "updatedAt")
SELECT 'wr_' || md5(w."id" || ':admin'), w."id", 'Admin', 'Full workspace access', '🛡️', 'DENYLIST', 1, NULL, CURRENT_TIMESTAMP
FROM "Workspace" w;

INSERT INTO "WorkspaceRoleDefinition" ("id", "workspaceId", "name", "description", "emoji", "mode", "version", "systemKey", "updatedAt")
SELECT 'wr_' || md5(w."id" || ':media-buyer'), w."id", 'Media buyer', 'Legacy media buyer role', '📣', 'DENYLIST', 1, NULL, CURRENT_TIMESTAMP
FROM "Workspace" w;

INSERT INTO "WorkspaceRoleDefinition" ("id", "workspaceId", "name", "description", "emoji", "mode", "version", "systemKey", "updatedAt")
SELECT 'wr_' || md5(w."id" || ':member'), w."id", 'Member', 'Legacy workspace member role', '👤', 'DENYLIST', 1, NULL, CURRENT_TIMESTAMP
FROM "Workspace" w;

UPDATE "WorkspaceMember" m
SET "roleDefinitionId" = CASE m."role"::text
  WHEN 'owner' THEN 'wr_' || md5(m."workspaceId" || ':owner')
  WHEN 'admin' THEN 'wr_' || md5(m."workspaceId" || ':admin')
  WHEN 'MEDIA_BUYER' THEN 'wr_' || md5(m."workspaceId" || ':media-buyer')
  ELSE 'wr_' || md5(m."workspaceId" || ':member')
END;
