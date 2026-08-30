import {
  WORKSPACE_FEATURE_REGISTRY,
  WORKSPACE_PERMISSION_KEYS,
} from "./registry";
import type {
  EffectiveWorkspaceAccess,
  WorkspaceRoleAccessDefinition,
  WorkspaceRoleSummary,
} from "./types";

export function validateWorkspacePermissionKeys(keys: readonly string[]) {
  return keys.filter((key) => !WORKSPACE_PERMISSION_KEYS.has(key));
}

export function effectiveWorkspacePermissionKeys(
  role: WorkspaceRoleAccessDefinition,
  isOwner = false,
) {
  if (isOwner) return [...WORKSPACE_PERMISSION_KEYS];
  const configured = new Set(role.permissionKeys);
  if (role.mode === "ALLOWLIST") {
    return [...WORKSPACE_PERMISSION_KEYS].filter((key) => configured.has(key));
  }
  return [...WORKSPACE_PERMISSION_KEYS].filter((key) => !configured.has(key));
}

export function hasWorkspacePermission(
  access: Pick<EffectiveWorkspaceAccess, "isOwner" | "permissionKeys">,
  permissionKey: string,
) {
  return access.isOwner || access.permissionKeys.includes(permissionKey);
}

export function summarizeWorkspaceRole(
  role: WorkspaceRoleAccessDefinition,
  isOwner = false,
): WorkspaceRoleSummary[] {
  const effective = new Set(effectiveWorkspacePermissionKeys(role, isOwner));
  return WORKSPACE_FEATURE_REGISTRY.map((feature) => {
    const permissionKeys = feature.permissions
      .map((item) => item.id)
      .filter((key) => effective.has(key));
    const capabilities = new Set(
      feature.permissions
        .filter((item) => effective.has(item.id))
        .map((item) => item.capability),
    );
    const level =
      permissionKeys.length === 0
        ? "none"
        : capabilities.has("manage") || capabilities.has("editAny")
          ? "manage"
          : capabilities.has("create") || capabilities.has("editOwn")
            ? "own"
            : "view";
    return { featureId: feature.id, level, permissionKeys };
  });
}

export function accessibleWorkspaceFeatureIds(
  access: Pick<EffectiveWorkspaceAccess, "isOwner" | "permissionKeys">,
) {
  if (access.isOwner) return WORKSPACE_FEATURE_REGISTRY.map((item) => item.id);
  const keys = new Set(access.permissionKeys);
  return WORKSPACE_FEATURE_REGISTRY.filter((feature) =>
    feature.permissions.some((permission) => keys.has(permission.id)),
  ).map((feature) => feature.id);
}
