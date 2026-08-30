"use client";

import { useEffect, useMemo, useState } from "react";
import { Camera, Eye, EyeOff, Pencil, ShieldCheck, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  telegramUserAccountsApi,
  workspaceMembersApi,
  type TelegramUserAccount,
  type WorkspaceMember,
  type WorkspaceRole,
} from "@/lib/api";
import { IconPicker } from "@/components/icons/icon-picker";
import { ActionMenu, ActionMenuItem } from "@/components/ui/action-menu";
import {
  Button,
  Card,
  EmptyState,
  FormError,
  FormField,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Select,
} from "@/components/ui/primitives";

type MemberFormValues = {
  email: string;
  name?: string;
  password?: string;
  role: WorkspaceRole;
  avatarIconId?: string | null;
  telegramUsername?: string | null;
  telegramUserAccountIds: string[];
};

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "Owner",
  admin: "Admin",
  MEDIA_BUYER: "Media buyer",
  member: "Member",
};

function roleOptionsFor(currentRole: WorkspaceRole) {
  if (currentRole === "owner") {
    return ["owner", "admin", "MEDIA_BUYER", "member"] as WorkspaceRole[];
  }
  if (currentRole === "admin") return ["member"] as WorkspaceRole[];
  return [] as WorkspaceRole[];
}

function RoleBadge({ role }: { role: WorkspaceRole }) {
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
      {role === "owner" ? <ShieldCheck size={12} /> : null}
      {ROLE_LABELS[role]}
    </span>
  );
}

export function WorkspaceMembersSection({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const qc = useQueryClient();
  const { workspace } = useAuth();
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

  const currentRole = workspace?.role;
  const ownersCount = useMemo(
    () => (data || []).filter((member) => member.role === "owner").length,
    [data],
  );
  const canAdd = currentRole === "owner" || currentRole === "admin";

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
    mutationFn: (payload: Omit<MemberFormValues, "telegramUserAccountIds">) =>
      workspaceMembersApi.create(payload),
    onSuccess: (res: WorkspaceMember & { temporaryPassword?: string }) => {
      setError("");
      qc.invalidateQueries({ queryKey: ["workspace-members"] });
      setOpen(false);
      setTempPassword(res?.temporaryPassword || "");
    },
    onError: (e: any) =>
      setError(e?.response?.data?.message || "Failed to add member"),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: {
        role?: WorkspaceRole;
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
      setEditingMember(null);
    },
    onError: (e: any) =>
      setError(e?.response?.data?.message || "Failed to update member"),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => workspaceMembersApi.remove(id),
    onSuccess: () => {
      setError("");
      qc.invalidateQueries({ queryKey: ["workspace-members"] });
    },
    onError: (e: any) =>
      setError(e?.response?.data?.message || "Failed to remove member"),
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

      <div className="grid grid-cols-1 items-start gap-2.5 md:grid-cols-2 2xl:grid-cols-4">
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
              className="relative self-start overflow-visible border-neutral-800 bg-neutral-900/60 p-0"
            >
              <div className="p-2.5">
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
                      <RoleBadge role={member.role} />
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

      <MemberModal
        open={open}
        mode="create"
        onClose={() => setOpen(false)}
        onSubmit={(values) =>
          createMutation.mutate({
            email: values.email,
            name: values.name,
            password: values.password,
            role: values.role,
            avatarIconId: values.avatarIconId,
            telegramUsername: values.telegramUsername?.trim() || null,
          })
        }
        currentRole={currentRole || "member"}
        telegramAccounts={telegramAccounts ?? []}
        members={data ?? []}
        accountOwnerById={accountOwnerById}
      />
      <MemberModal
        open={!!editingMember}
        mode="edit"
        member={editingMember}
        onClose={() => setEditingMember(null)}
        onSubmit={(values) => {
          if (!editingMember) return;
          updateMutation.mutate({
            id: editingMember.id,
            payload: {
              role: values.role,
              avatarIconId: values.avatarIconId,
              telegramUsername: values.telegramUsername?.trim() || null,
              telegramUserAccountIds: values.telegramUserAccountIds,
            },
          });
        }}
        currentRole={currentRole || "member"}
        telegramAccounts={telegramAccounts ?? []}
        members={data ?? []}
        accountOwnerById={accountOwnerById}
      />
    </>
  );
}

function MemberModal({
  open,
  mode,
  member,
  onClose,
  onSubmit,
  currentRole,
  telegramAccounts,
  accountOwnerById,
}: {
  open: boolean;
  mode: "create" | "edit";
  member?: WorkspaceMember | null;
  onClose: () => void;
  onSubmit: (v: MemberFormValues) => void;
  currentRole: WorkspaceRole;
  telegramAccounts: TelegramUserAccount[];
  members: WorkspaceMember[];
  accountOwnerById: Map<string, WorkspaceMember>;
}) {
  const allowedRoles = useMemo(
    () => roleOptionsFor(currentRole),
    [currentRole],
  );
  const initialAssignedIds = useMemo(
    () =>
      member?.assignedTelegramUserAccounts?.map((account) => account.id) ?? [],
    [member],
  );
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<MemberFormValues>({
    defaultValues: {
      email: "",
      name: "",
      password: "",
      role: allowedRoles[0] ?? "member",
      avatarIconId: null,
      telegramUsername: "",
      telegramUserAccountIds: [],
    },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      email: mode === "create" ? "" : (member?.user.email ?? ""),
      name: mode === "create" ? "" : (member?.user.name ?? ""),
      password: "",
      role:
        mode === "create"
          ? (allowedRoles[0] ?? "member")
          : (member?.role ?? "member"),
      avatarIconId: member?.avatarIconId ?? null,
      telegramUsername: member?.telegramUsername ?? "",
      telegramUserAccountIds: initialAssignedIds,
    });
  }, [allowedRoles, initialAssignedIds, member, mode, open, reset]);

  const selectedAccountIds = watch("telegramUserAccountIds") ?? [];

  const toggleAccount = (accountId: string, checked: boolean) => {
    const next = checked
      ? [...new Set([...selectedAccountIds, accountId])]
      : selectedAccountIds.filter((id) => id !== accountId);
    setValue("telegramUserAccountIds", next, { shouldDirty: true });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        mode === "create"
          ? "Add Member"
          : `Edit ${member?.user.name ?? "member"}`
      }
    >
      <form
        className="space-y-4"
        onSubmit={handleSubmit((values) => onSubmit(values))}
      >
        <FormField label="Avatar image">
          <IconPicker
            iconId={watch("avatarIconId") ?? null}
            icon={member?.avatarPresentation}
            onChange={(avatarIconId) =>
              setValue("avatarIconId", avatarIconId, { shouldDirty: true })
            }
            buttonLabel="Upload avatar"
          />
        </FormField>

        <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
          <p className="text-sm font-medium text-white">Role</p>
          <div className="mt-3 space-y-3">
            {mode === "create" ? (
              <>
                <FormField
                  label="Email"
                  required
                  error={errors.email ? "Required field" : undefined}
                >
                  <Input {...register("email", { required: true })} />
                </FormField>
                <FormField label="Name">
                  <Input {...register("name")} />
                </FormField>
                <FormField label="Password (optional)">
                  <Input type="password" {...register("password")} />
                </FormField>
              </>
            ) : null}
            <FormField label="Role">
              <Select {...register("role")}>
                {allowedRoles.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
          <p className="text-sm font-medium text-white">Telegram identity</p>
          <div className="mt-3 space-y-3">
            <FormField label="Telegram username">
              <Input placeholder="@matvey" {...register("telegramUsername")} />
              <p className="mt-2 text-xs text-neutral-500">
                Used to match invite links when this person's MTProto account is
                not connected.
              </p>
            </FormField>

            {mode === "edit" ? (
              <div>
                <p className="text-sm text-neutral-200">Telegram accounts</p>
                <div className="mt-2 space-y-2">
                  {telegramAccounts.length ? (
                    telegramAccounts.map((account) => {
                      const owner = accountOwnerById.get(account.id);
                      const isTakenByOther = owner && owner.id !== member?.id;
                      const checked = selectedAccountIds.includes(account.id);
                      const title =
                        [account.firstName, account.lastName]
                          .filter(Boolean)
                          .join(" ") || account.label;
                      return (
                        <label
                          key={account.id}
                          className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-sm ${isTakenByOther ? "border-neutral-800 bg-neutral-900/30 text-neutral-500" : "border-neutral-700 bg-neutral-900 text-neutral-200"}`}
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={checked}
                            disabled={Boolean(isTakenByOther)}
                            onChange={(event) =>
                              toggleAccount(account.id, event.target.checked)
                            }
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-white">
                              {title}
                            </p>
                            <p className="truncate text-xs text-neutral-400">
                              {account.username
                                ? `@${account.username}`
                                : account.label}
                            </p>
                            <p className="mt-1 text-xs text-neutral-500">
                              {account.status}
                            </p>
                            {isTakenByOther ? (
                              <p className="mt-1 text-xs text-amber-300">
                                Already linked to {owner.user.name}
                              </p>
                            ) : null}
                          </div>
                        </label>
                      );
                    })
                  ) : (
                    <p className="text-sm text-neutral-500">
                      No MTProto accounts connected yet.
                    </p>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">{mode === "create" ? "Add" : "Save"}</Button>
        </div>
      </form>
    </Modal>
  );
}
