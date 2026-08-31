"use client";

import { useMemo, useState } from "react";
import { Camera, Eye, EyeOff, Pencil, ShieldCheck, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  telegramUserAccountsApi,
  workspaceMembersApi,
  type WorkspaceMember,
  type WorkspaceRole,
} from "@/lib/api";
import { IconPicker } from "@/components/icons/icon-picker";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { ActionMenu, ActionMenuItem } from "@/components/ui/action-menu";
import {
  Button,
  Card,
  EmptyState,
  FormError,
  LoadingState,
  PageHeader,
} from "@/components/ui/primitives";
import { workspaceRolesApi } from "@/lib/features/workspace/workspace-roles-api";
import { workspaceKeys } from "@/lib/query-keys";

import {
  WorkspaceMemberModal,
  type MemberFormValues,
} from "./workspace-member-modal";

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "Owner",
  admin: "Admin",
  MEDIA_BUYER: "Media buyer",
  member: "Member",
};

function RoleBadge({ member }: { member: WorkspaceMember }) {
  const role = member.role;
  const definition = member.roleDefinition;
  const tone =
    role === "owner"
      ? "border-amber-400/20 bg-amber-500/15 text-amber-200"
      : role === "admin"
        ? "border-sky-400/20 bg-sky-500/15 text-sky-200"
        : role === "MEDIA_BUYER"
          ? "border-emerald-400/20 bg-emerald-500/15 text-emerald-200"
          : "border-neutral-700 bg-neutral-800 text-neutral-200";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {definition?.iconPresentation ? (
        <IconAvatar
          icon={definition.iconPresentation}
          label={definition.name}
          size="xs"
          bordered={false}
          className="!h-3.5 !w-3.5 !bg-transparent text-xs"
        />
      ) : role === "owner" ? (
        <ShieldCheck size={12} />
      ) : null}
      {definition?.name ?? ROLE_LABELS[role]}
    </span>
  );
}

function apiErrorMessage(error: unknown, fallback: string) {
  const response = error as {
    response?: { data?: { message?: string } };
  };
  return response.response?.data?.message || fallback;
}

export function WorkspaceMembersSection({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const qc = useQueryClient();
  const { workspace } = useAuth();
  const currentRole = workspace?.role;
  const canAdd = currentRole === "owner" || currentRole === "admin";
  const [open, setOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<WorkspaceMember | null>(
    null,
  );
  const [tempPassword, setTempPassword] = useState<string>("");
  const [error, setError] = useState("");
  const {
    data,
    isLoading,
    error: membersError,
  } = useQuery({
    queryKey: ["workspace-members"],
    queryFn: workspaceMembersApi.list,
  });
  const { data: telegramAccounts } = useQuery({
    queryKey: ["telegram-user-accounts"],
    queryFn: telegramUserAccountsApi.list,
  });
  const roles = useQuery({
    queryKey: workspaceKeys.roles(),
    queryFn: workspaceRolesApi.list,
    enabled: canAdd,
  });

  const ownersCount = useMemo(
    () => (data || []).filter((member) => member.role === "owner").length,
    [data],
  );

  const accountOwnerById = useMemo(() => {
    const map = new Map<string, WorkspaceMember>();
    for (const member of data || []) {
      for (const account of member.assignedTelegramUserAccounts || []) {
        map.set(account.id, member);
      }
    }
    return map;
  }, [data]);

  const createMutation = useMutation({
    mutationFn: (payload: MemberFormValues) =>
      workspaceMembersApi.create(payload),
    onSuccess: (res: WorkspaceMember & { temporaryPassword?: string }) => {
      setError("");
      qc.invalidateQueries({ queryKey: ["workspace-members"] });
      qc.invalidateQueries({ queryKey: workspaceKeys.roles() });
      setOpen(false);
      setTempPassword(res?.temporaryPassword || "");
    },
    onError: (error: unknown) =>
      setError(apiErrorMessage(error, "Failed to add member")),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: {
        role?: WorkspaceRole;
        roleDefinitionId?: string;
        isHidden?: boolean;
        avatarIconId?: string | null;
        telegramUsername?: string | null;
        telegramUserAccountIds?: string[];
      };
    }) => workspaceMembersApi.update(id, payload),
    onSuccess: () => {
      setError("");
      qc.invalidateQueries({ queryKey: ["workspace-members"] });
      qc.invalidateQueries({ queryKey: ["telegram-user-accounts"] });
      qc.invalidateQueries({ queryKey: workspaceKeys.roles() });
      setEditingMember(null);
    },
    onError: (error: unknown) =>
      setError(apiErrorMessage(error, "Failed to update member")),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => workspaceMembersApi.remove(id),
    onSuccess: () => {
      setError("");
      qc.invalidateQueries({ queryKey: ["workspace-members"] });
      qc.invalidateQueries({ queryKey: workspaceKeys.roles() });
    },
    onError: (error: unknown) =>
      setError(apiErrorMessage(error, "Failed to remove member")),
  });

  const canRemove = (member: WorkspaceMember) => {
    if (currentRole === "owner") {
      if (member.role === "owner" && ownersCount <= 1) return false;
      if (member.isCurrentUser && member.role === "owner" && ownersCount <= 1)
        return false;
      return true;
    }
    if (currentRole === "admin") return member.role === "member";
    return false;
  };

  return (
    <>
      {embedded ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Workspace members
            </h2>
            <p className="text-xs text-neutral-400">
              Roles, access and Telegram identity
            </p>
          </div>
          {canAdd ? (
            <Button onClick={() => setOpen(true)}>Add Member</Button>
          ) : null}
        </div>
      ) : (
        <PageHeader
          title={`${workspace?.name || "Workspace"} Members`}
          subtitle="Manage your team"
          action={
            canAdd ? (
              <Button onClick={() => setOpen(true)}>Add Member</Button>
            ) : null
          }
        />
      )}

      {tempPassword ? (
        <div className="mb-4 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-amber-200">
          Temporary password (show once):{" "}
          <span className="font-mono">{tempPassword}</span>
        </div>
      ) : null}
      <FormError message={error} />
      {isLoading ? <LoadingState /> : null}

      <div className="columns-1 gap-4 md:columns-2 xl:columns-3">
        {data?.map((member: WorkspaceMember) => {
          const hasInvestments =
            Number(member.investmentSummary?.totalInvestedPrimary ?? 0) > 0;
          const canManageMember =
            currentRole === "owner" && !member.isCurrentUser;
          const linkedAccountsCount =
            member.assignedTelegramUserAccounts?.length ?? 0;
          return (
            <Card
              key={member.id}
              className="relative mb-4 inline-block w-full break-inside-avoid overflow-visible border-neutral-800 bg-neutral-900/60 align-top !p-0"
            >
              <div className="p-4">
                <div className="flex items-start gap-2.5">
                  <div className="relative shrink-0">
                    <IconPicker
                      compact
                      iconId={member.avatarIconId ?? null}
                      icon={member.avatarPresentation}
                      onChange={(avatarIconId) =>
                        updateMutation.mutate({
                          id: member.id,
                          payload: { avatarIconId },
                        })
                      }
                      buttonLabel="Upload avatar"
                      className={`!h-10 !w-10 !overflow-hidden !rounded-lg !border-neutral-700 !bg-neutral-950 text-sm ${!member.avatarIconId ? "[&>svg]:hidden" : ""}`}
                      iconClassName="!h-full !w-full !rounded-lg !border-0 !bg-transparent !text-2xl"
                    />
                    {!member.avatarIconId ? (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg text-base font-semibold text-neutral-300">
                        {(member.user.name?.trim()?.[0] || "?").toUpperCase()}
                      </div>
                    ) : null}
                    <span className="pointer-events-none absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-md border border-neutral-800 bg-neutral-900 text-blue-300">
                      <Camera size={11} />
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <h3 className="truncate text-base font-semibold text-white">
                        {member.user.name}
                      </h3>
                      {member.isCurrentUser ? (
                        <span className="shrink-0 rounded-full border border-blue-400/20 bg-blue-500/15 px-1.5 py-0.5 text-[11px] font-medium text-blue-200">
                          You
                        </span>
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-neutral-400">
                      {member.user.email}
                    </p>
                    <div className="mt-1 flex min-w-0 items-center gap-1.5">
                      <RoleBadge member={member} />
                      {member.isHidden ? (
                        <span className="truncate rounded-full border border-neutral-700 bg-neutral-950/70 px-2 py-0.5 text-xs text-neutral-400">
                          Finance hidden
                        </span>
                      ) : null}
                    </div>
                    {member.telegramUsername || linkedAccountsCount > 0 ? (
                      <p className="mt-1 truncate text-xs text-neutral-500">
                        {member.telegramUsername
                          ? `@${member.telegramUsername}`
                          : `${linkedAccountsCount} Telegram ${linkedAccountsCount === 1 ? "account" : "accounts"}`}
                      </p>
                    ) : null}
                  </div>
                  {canManageMember ? (
                    <ActionMenu label={`Actions for ${member.user.name}`}>
                      <ActionMenuItem
                        icon={<Pencil size={15} />}
                        onClick={() => setEditingMember(member)}
                      >
                        Edit member
                      </ActionMenuItem>
                      <ActionMenuItem
                        icon={
                          member.isHidden ? (
                            <Eye size={15} />
                          ) : (
                            <EyeOff size={15} />
                          )
                        }
                        onClick={() =>
                          updateMutation.mutate({
                            id: member.id,
                            payload: { isHidden: !member.isHidden },
                          })
                        }
                      >
                        {member.isHidden
                          ? "Show in finance"
                          : "Hide from finance"}
                      </ActionMenuItem>
                      {canRemove(member) ? (
                        <ActionMenuItem
                          danger
                          icon={<Trash2 size={15} />}
                          onClick={() => removeMutation.mutate(member.id)}
                        >
                          Remove member
                        </ActionMenuItem>
                      ) : null}
                    </ActionMenu>
                  ) : null}
                </div>

                {hasInvestments ? (
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-800 pt-2 text-xs">
                    <span className="text-neutral-500">Invested</span>
                    <span className="font-semibold tabular-nums text-neutral-100">
                      {Number(
                        member.investmentSummary?.totalInvestedDisplay ?? 0,
                      ).toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}{" "}
                      {member.investmentSummary?.displayCurrency}
                      <span className="ml-2 font-normal text-neutral-500">
                        {Number(
                          member.investmentSummary?.investmentSharePercent ?? 0,
                        ).toFixed(2)}
                        %
                      </span>
                    </span>
                  </div>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>

      {!isLoading && !membersError && !data?.length ? (
        <EmptyState text="No members" />
      ) : null}

      <WorkspaceMemberModal
        open={open}
        mode="create"
        onClose={() => setOpen(false)}
        onSubmit={(values) =>
          createMutation.mutate({
            email: values.email,
            name: values.name,
            ...(values.password?.trim() ? { password: values.password } : {}),
            roleDefinitionId: values.roleDefinitionId,
            avatarIconId: values.avatarIconId,
            telegramUsername: values.telegramUsername?.trim() || null,
            telegramUserAccountIds: values.telegramUserAccountIds,
          })
        }
        currentRole={currentRole || "member"}
        telegramAccounts={telegramAccounts ?? []}
        accountOwnerById={accountOwnerById}
        roles={roles.data ?? []}
        rolesLoading={roles.isLoading}
        rolesError={!!roles.error}
      />
      <WorkspaceMemberModal
        open={!!editingMember}
        mode="edit"
        member={editingMember}
        onClose={() => setEditingMember(null)}
        onSubmit={(values) => {
          if (!editingMember) return;
          updateMutation.mutate({
            id: editingMember.id,
            payload: {
              roleDefinitionId: values.roleDefinitionId,
              avatarIconId: values.avatarIconId,
              telegramUsername: values.telegramUsername?.trim() || null,
              telegramUserAccountIds: values.telegramUserAccountIds,
            },
          });
        }}
        currentRole={currentRole || "member"}
        telegramAccounts={telegramAccounts ?? []}
        accountOwnerById={accountOwnerById}
        roles={roles.data ?? []}
        rolesLoading={roles.isLoading}
        rolesError={!!roles.error}
      />
    </>
  );
}
