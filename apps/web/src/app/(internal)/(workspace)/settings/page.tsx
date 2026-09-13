"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { InlineIconPicker } from "@/components/icons/inline-icon-picker";
import {
  Button,
  Card,
  ConfirmDeleteModal,
  Input,
  LoadingState,
  PageHeader,
} from "@/components/ui/primitives";
import { TimezoneSelect } from "@/components/ui/timezone-select";
import { accountApi, authApi, workspacesApi } from "@/lib/api";
import { WorkspaceMembersSection } from "@/components/features/workspace/workspace-members-section";
import { WorkspaceTools } from "@/components/features/workspace/workspace-tools";
import { WorkspaceAdSalesDefaults } from "@/components/features/workspace/workspace-ad-sales-defaults";

export default function SettingsPage() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["auth", "me"], queryFn: authApi.me });
  const workspaceAccess = me.data?.workspace.access;
  const legacyAdmin =
    me.data?.workspace.role === "owner" || me.data?.workspace.role === "admin";
  const isOwner =
    workspaceAccess?.isOwner ?? me.data?.workspace.role === "owner";
  const hasFeature = (featureId: string) =>
    isOwner ||
    (workspaceAccess
      ? workspaceAccess.featureIds.includes(featureId)
      : legacyAdmin);
  const canManageWorkspace = hasFeature("workspace");
  const canViewMembers = hasFeature("members");
  const { data: workspaces } = useQuery({
    queryKey: ["workspaces"],
    queryFn: workspacesApi.list,
    enabled: canManageWorkspace,
  });
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceTimezone, setWorkspaceTimezone] = useState("Europe/Warsaw");
  const [workspaceIconId, setWorkspaceIconId] = useState<string | null>(null);
  const [workspaceDeleteOpen, setWorkspaceDeleteOpen] = useState(false);
  const workspaceMutation = useMutation({
    mutationFn: accountApi.updateWorkspace,
    onSuccess: () => me.refetch(),
  });
  const deleteWorkspaceMutation = useMutation({
    mutationFn: workspacesApi.remove,
    onSuccess: async () => {
      const currentWorkspaceId = me.data?.workspace.id;
      const remainingWorkspaceId =
        workspaces?.find((workspace) => workspace.id !== currentWorkspaceId)
          ?.id ?? "";
      if (remainingWorkspaceId) {
        localStorage.setItem("selected-workspace-id", remainingWorkspaceId);
      } else {
        localStorage.removeItem("selected-workspace-id");
      }
      setWorkspaceDeleteOpen(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["workspaces"] }),
        qc.invalidateQueries({ queryKey: ["auth", "me"] }),
      ]);
      if (!remainingWorkspaceId && typeof window !== "undefined") {
        window.location.reload();
      }
    },
  });

  useEffect(() => {
    if (!me.data?.workspace) return;
    // Query data hydrates editable workspace form fields.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWorkspaceName(me.data.workspace.name);
    setWorkspaceTimezone(me.data.workspace.timezone ?? "Europe/Warsaw");
    setWorkspaceIconId(me.data.workspace.avatarIcon?.id ?? null);
  }, [me.data]);

  return (
    <AppShell>
      <PageHeader
        title="Workspace settings"
        subtitle="People, access, automation and workspace defaults in one place."
      />
      {me.isLoading ? <LoadingState /> : null}
      <div className="space-y-4">
        <WorkspaceTools
          role={me.data?.workspace.role}
          access={me.data?.workspace.access}
        />
        {canViewMembers ? (
          <section>
            <WorkspaceMembersSection embedded />
          </section>
        ) : null}
        {canManageWorkspace ? (
          <Card>
            <h3 className="text-lg font-semibold">Workspace</h3>
            <div className="mt-4 space-y-3">
              <div className="flex items-end gap-3">
                <InlineIconPicker
                  iconId={workspaceIconId}
                  icon={me.data?.workspace.avatarPresentation}
                  onChange={setWorkspaceIconId}
                  className="mb-0.5 shrink-0 text-2xl"
                />
                <div className="min-w-0 flex-1">
                  <label className="mb-1 block text-sm text-neutral-300">
                    Workspace name
                  </label>
                  <Input
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm text-neutral-300">
                  Workspace timezone
                </label>
                <TimezoneSelect
                  value={workspaceTimezone}
                  onChange={setWorkspaceTimezone}
                />
              </div>
              <div className="flex justify-end gap-3">
                <div className="flex items-center gap-2">
                  <Button
                    variant="danger"
                    onClick={() => setWorkspaceDeleteOpen(true)}
                    disabled={deleteWorkspaceMutation.isPending}
                  >
                    Delete
                  </Button>
                  <Button
                    onClick={() =>
                      workspaceMutation.mutate({
                        name: workspaceName.trim(),
                        timezone: workspaceTimezone.trim() || "Europe/Warsaw",
                        avatarIconId: workspaceIconId,
                      })
                    }
                    disabled={
                      !workspaceName.trim() ||
                      !workspaceTimezone.trim() ||
                      workspaceMutation.isPending
                    }
                  >
                    Save
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ) : null}
        {canManageWorkspace ? (
          <WorkspaceAdSalesDefaults isOwner={isOwner} />
        ) : null}
      </div>
      <ConfirmDeleteModal
        open={workspaceDeleteOpen}
        onClose={() => setWorkspaceDeleteOpen(false)}
        onConfirm={() => {
          if (!me.data?.workspace.id) return;
          return deleteWorkspaceMutation.mutateAsync(me.data.workspace.id);
        }}
        entityName={me.data?.workspace.name ?? "workspace"}
        label="Delete workspace"
        description="This will delete your channels, transactions, accounts, categories, members, and other data in this workspace. Advertising channels, promos, and ad campaigns are kept as part of the workspace cleanup scope and will not be removed outside this workspace."
      />
    </AppShell>
  );
}
