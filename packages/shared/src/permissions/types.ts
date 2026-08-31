import type { ResolvedEmoji } from "../types/resolved-emoji";

export type WorkspaceRoleMode = "ALLOWLIST" | "DENYLIST";

export type PermissionCapability =
  | "view"
  | "create"
  | "editOwn"
  | "editAny"
  | "deleteOwn"
  | "deleteAny"
  | "manage";

export type PermissionSensitivity = "standard" | "sensitive" | "critical";

export type PermissionDefinition = {
  id: string;
  featureId: string;
  capability: PermissionCapability | string;
  labelKey: string;
  descriptionKey: string;
  sensitivity: PermissionSensitivity;
};

export type FeatureDefinition = {
  id: string;
  labelKey: string;
  descriptionKey: string;
  permissions: readonly PermissionDefinition[];
  surfaces: {
    navigation: readonly string[];
    search: readonly string[];
    dashboard: readonly string[];
  };
};

export type WorkspaceRoleAccessDefinition = {
  mode: WorkspaceRoleMode;
  permissionKeys: readonly string[];
};

export type EffectiveWorkspaceAccess = {
  roleId: string | null;
  roleVersion: number;
  isOwner: boolean;
  permissionKeys: readonly string[];
  featureIds: readonly string[];
};

export type WorkspaceRoleSummary = {
  featureId: string;
  level: "none" | "view" | "own" | "manage";
  permissionKeys: readonly string[];
};

export type WorkspaceRoleContract = {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  emoji: string | null;
  iconId: string | null;
  iconPresentation: ResolvedEmoji | null;
  mode: WorkspaceRoleMode;
  permissionKeys: string[];
  version: number;
  systemKey: "OWNER" | null;
  membersCount: number;
  summaries: WorkspaceRoleSummary[];
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceMemberRoleSummary = {
  id: string;
  name: string;
  systemKey: "OWNER" | null;
  iconPresentation: ResolvedEmoji | null;
};
