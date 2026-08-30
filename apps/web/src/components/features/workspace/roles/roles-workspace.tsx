"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkspaceRoleContract } from "@telegram-system/shared";
import { Copy, Pencil, Plus, ShieldCheck, Trash2, Users } from "lucide-react";
import { ActionMenu, ActionMenuItem } from "@/components/ui/action-menu";
import { IconAvatar } from "@/components/icons/icon-avatar";
import {
  Button,
  Card,
  ConfirmDeleteModal,
  EmptyState,
  LoadingState,
  Modal,
  PageHeader,
} from "@/components/ui/primitives";
import { workspaceMembersApi } from "@/lib/api";
import { workspaceKeys } from "@/lib/query-keys";
import {
  workspaceRolesApi,
  type WorkspaceRoleInput,
} from "@/lib/features/workspace/workspace-roles-api";
import { RoleEditor } from "./role-editor";

type AssignableMember = Awaited<
  ReturnType<typeof workspaceMembersApi.select>
>[number];

export function RolesWorkspace() {
  const qc = useQueryClient();
  const roles = useQuery({
    queryKey: workspaceKeys.roles(),
    queryFn: workspaceRolesApi.list,
  });
  const registry = useQuery({
    queryKey: workspaceKeys.roleRegistry(),
    queryFn: workspaceRolesApi.registry,
  });
  const members = useQuery({
    queryKey: workspaceKeys.membersSelect(),
    queryFn: workspaceMembersApi.select,
  });
  const [editing, setEditing] = useState<WorkspaceRoleContract | "new" | null>(
    null,
  );
  const [assigning, setAssigning] = useState<WorkspaceRoleContract | null>(
    null,
  );
  const [deleting, setDeleting] = useState<WorkspaceRoleContract | null>(null);
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());

  const refresh = async () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: workspaceKeys.roles() }),
      qc.invalidateQueries({ queryKey: workspaceKeys.members() }),
      qc.invalidateQueries({ queryKey: workspaceKeys.membersSelect() }),
      qc.invalidateQueries({ queryKey: ["auth", "me"] }),
    ]);
  const save = useMutation({
    mutationFn: ({
      role,
      input,
    }: {
      role?: WorkspaceRoleContract;
      input: WorkspaceRoleInput;
    }) =>
      role
        ? workspaceRolesApi.update(role.id, input)
        : workspaceRolesApi.create(input),
    onSuccess: async () => {
      setEditing(null);
      await refresh();
    },
  });
  const copy = useMutation({
    mutationFn: workspaceRolesApi.copy,
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: workspaceRolesApi.remove,
    onSuccess: async () => {
      setDeleting(null);
      await refresh();
    },
  });
  const assign = useMutation({
    mutationFn: ({ roleId, ids }: { roleId: string; ids: string[] }) =>
      workspaceRolesApi.assignMembers(roleId, ids),
    onSuccess: async () => {
      setAssigning(null);
      await refresh();
    },
  });
  const featureCount = registry.data?.features.length ?? 0;
  const canManageRoles = registry.data?.access?.isOwner ?? false;
  const currentMembers = members.data as AssignableMember[] | undefined;
  const assignedCount = useMemo(() => memberIds.size, [memberIds]);

  const openAssignments = (role: WorkspaceRoleContract) => {
    setAssigning(role);
    setMemberIds(new Set());
  };

  return (
    <>
      <PageHeader
        title="Roles & access"
        subtitle="Create reusable roles and control what members can see and change."
        action={
          canManageRoles ? (
            <Button onClick={() => setEditing("new")}>
              <Plus size={16} />
              Create role
            </Button>
          ) : undefined
        }
      />
      {roles.isLoading || registry.isLoading ? (
        <LoadingState text="Loading roles…" />
      ) : null}
      {roles.error || registry.error ? (
        <Card className="border-red-900 text-red-300">
          Roles could not be loaded. Check your access and try again.
        </Card>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {roles.data?.map((role) => {
          const visible = role.summaries.filter(
            (item) => item.level !== "none",
          );
          return (
            <Card key={role.id} className="relative flex flex-col p-4">
              <div className="flex items-start gap-3">
                {role.iconPresentation ? (
                  <IconAvatar
                    icon={role.iconPresentation}
                    label={role.name}
                    size="md"
                    className="!h-10 !w-10 rounded-lg bg-neutral-950"
                  />
                ) : role.emoji ? (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-950 text-xl" aria-hidden="true">
                    {role.emoji}
                  </span>
                ) : (
                  <IconAvatar label={role.name} size="md" className="!h-10 !w-10 rounded-lg bg-neutral-950" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-semibold text-white">
                      {role.name}
                    </h2>
                    {role.systemKey === "OWNER" ? (
                      <span className="rounded-full bg-blue-950 px-2 py-1 text-xs text-blue-300">
                        Protected
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-xs text-neutral-400">
                    {role.description || "No description"}
                  </p>
                </div>
                {canManageRoles && role.systemKey !== "OWNER" ? (
                  <ActionMenu label={`Actions for ${role.name}`}>
                    <ActionMenuItem
                      icon={<Users size={15} />}
                      onClick={() => openAssignments(role)}
                    >
                      Assign members
                    </ActionMenuItem>
                    <ActionMenuItem
                      icon={<Copy size={15} />}
                      onClick={() => copy.mutate(role.id)}
                      disabled={copy.isPending}
                    >
                      Copy role
                    </ActionMenuItem>
                    <ActionMenuItem
                      icon={<Pencil size={15} />}
                      onClick={() => setEditing(role)}
                    >
                      Edit role
                    </ActionMenuItem>
                    <ActionMenuItem
                      danger
                      icon={<Trash2 size={15} />}
                      onClick={() => setDeleting(role)}
                    >
                      Delete role
                    </ActionMenuItem>
                  </ActionMenu>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-neutral-800 pt-3 text-xs">
                <span className="flex items-center gap-1.5 text-neutral-400">
                  <Users size={13} />
                  <strong className="text-neutral-200">
                    {role.membersCount}
                  </strong>{" "}
                  members
                </span>
                <span className="flex items-center gap-1.5 text-neutral-400">
                  <ShieldCheck size={13} />
                  <strong className="text-neutral-200">
                    {role.systemKey === "OWNER" ? featureCount : visible.length}
                  </strong>{" "}
                  features
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-neutral-500">
                {role.systemKey === "OWNER"
                  ? "Full protected access to every current and future workspace feature."
                  : role.mode === "DENYLIST"
                    ? "Broad access with explicit exceptions."
                    : visible.length
                      ? `Access to ${visible.map((item) => item.featureId).join(", ")}.`
                      : "No feature access configured."}
              </p>
            </Card>
          );
        })}
      </div>
      {!roles.isLoading && !roles.data?.length ? (
        <EmptyState text="No roles yet. Create the first reusable workspace role." />
      ) : null}

      <RoleEditor
        open={editing !== null}
        role={editing === "new" ? null : editing}
        features={registry.data?.features ?? []}
        saving={save.isPending}
        onClose={() => setEditing(null)}
        onSave={(input) =>
          save.mutate({
            role: editing && editing !== "new" ? editing : undefined,
            input,
          })
        }
      />
      <Modal
        open={!!assigning}
        onClose={() => setAssigning(null)}
        title={`Assign ${assigning?.name ?? "role"}`}
        size="sm"
      >
        <div className="space-y-2">
          {currentMembers?.map((member) => (
            <label
              key={member.id}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-neutral-800 p-3 hover:bg-neutral-900"
            >
              <input
                type="checkbox"
                checked={memberIds.has(member.id)}
                onChange={(event) =>
                  setMemberIds((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(member.id);
                    else next.delete(member.id);
                    return next;
                  })
                }
              />
              <span className="min-w-0">
                <span className="block truncate text-sm text-white">
                  {member.user.name}
                </span>
                <span className="block truncate text-xs text-neutral-500">
                  {member.user.email}
                </span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          Selected members will be moved from their current role. Existing
          assignments not selected stay unchanged.
        </p>
        <div className="mt-5 flex items-center justify-between">
          <span className="text-xs text-neutral-400">
            {assignedCount} selected
          </span>
          <Button
            disabled={assign.isPending || !assigning || assignedCount === 0}
            onClick={() =>
              assigning &&
              assign.mutate({ roleId: assigning.id, ids: [...memberIds] })
            }
          >
            Assign selected
          </Button>
        </div>
      </Modal>
      <ConfirmDeleteModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() =>
          deleting ? remove.mutateAsync(deleting.id) : Promise.resolve()
        }
        entityName={deleting?.name ?? "role"}
        label="Delete role"
        description="Members must be reassigned before a role can be deleted."
      />
    </>
  );
}
