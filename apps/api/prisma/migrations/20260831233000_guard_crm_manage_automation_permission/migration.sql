-- DENYLIST roles inherit permissions that are absent from their exception set.
-- Keep the new automation capability fail-closed for every existing non-owner
-- role. Owners retain their immutable all-permissions bypass.
INSERT INTO "WorkspaceRolePermission" (
  "id",
  "roleId",
  "permissionKey",
  "effect"
)
SELECT
  'wrp_' || MD5(r."id" || ':adSales.crm.manageAutomation'),
  r."id",
  'adSales.crm.manageAutomation',
  'DENY'::"WorkspaceRolePermissionEffect"
FROM "WorkspaceRoleDefinition" r
WHERE r."mode" = 'DENYLIST'
  AND r."systemKey" IS DISTINCT FROM 'OWNER'
ON CONFLICT ("roleId", "permissionKey")
DO UPDATE SET "effect" = EXCLUDED."effect";
