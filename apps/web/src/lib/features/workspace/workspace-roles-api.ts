import type {
  EffectiveWorkspaceAccess,
  FeatureDefinition,
  WorkspaceRoleContract,
  WorkspaceRoleMode,
} from "@telegram-system/shared";
import { api } from "@/lib/api";

export type WorkspaceRoleInput = {
  name: string;
  description: string;
  iconId: string | null;
  mode: WorkspaceRoleMode;
  permissionKeys: string[];
  version?: number;
};

export type WorkspaceRoleRegistryResponse = {
  features: readonly FeatureDefinition[];
  access?: EffectiveWorkspaceAccess;
};

export const workspaceRolesApi = {
  registry: async (): Promise<WorkspaceRoleRegistryResponse> => {
    const { data } = await api.get<
      WorkspaceRoleRegistryResponse | readonly FeatureDefinition[]
    >("/workspace-roles/registry");
    return Array.isArray(data)
      ? { features: data as readonly FeatureDefinition[] }
      : (data as WorkspaceRoleRegistryResponse);
  },
  list: async () =>
    (await api.get<WorkspaceRoleContract[]>("/workspace-roles")).data,
  get: async (roleId: string) =>
    (await api.get<WorkspaceRoleContract>(`/workspace-roles/${roleId}`)).data,
  create: async (input: WorkspaceRoleInput) =>
    (await api.post<WorkspaceRoleContract>("/workspace-roles", input)).data,
  update: async (roleId: string, input: WorkspaceRoleInput) =>
    (
      await api.patch<WorkspaceRoleContract>(
        `/workspace-roles/${roleId}`,
        input,
      )
    ).data,
  remove: async (roleId: string) =>
    (await api.delete<{ success: boolean }>(`/workspace-roles/${roleId}`)).data,
  copy: async (roleId: string) =>
    (
      await api.post<WorkspaceRoleContract>(
        `/workspace-roles/${roleId}/copy`,
        {},
      )
    ).data,
  assignMembers: async (roleId: string, memberIds: string[]) =>
    (
      await api.post<{ roleId: string; assignedMemberIds: string[] }>(
        `/workspace-roles/${roleId}/members`,
        { memberIds },
      )
    ).data,
};
