'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/app-shell';
import { InlineIconPicker } from '@/components/icons/inline-icon-picker';
import { Button, Card, ConfirmDeleteModal, Input, LoadingState, PageHeader } from '@/components/ui/primitives';
import { TimezoneSelect } from '@/components/ui/timezone-select';
import { accountApi, authApi, telegramAdSalesApi, workspacesApi } from '@/lib/api';
import { WorkspaceMembersSection } from '@/components/features/workspace/workspace-members-section';

export default function SettingsPage() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['auth', 'me'], queryFn: authApi.me });
  const { data: workspaces } = useQuery({ queryKey: ['workspaces'], queryFn: workspacesApi.list });
  const adSalesWorkspaceSettings = useQuery({
    queryKey: ['telegram-ad-sales', 'workspace-settings'],
    queryFn: telegramAdSalesApi.getWorkspaceSettings,
  });
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceTimezone, setWorkspaceTimezone] = useState('Europe/Warsaw');
  const [workspaceIconId, setWorkspaceIconId] = useState<string | null>(null);
  const [defaultOrganicPostsPerAdSlotDraft, setDefaultOrganicPostsPerAdSlot] = useState<string | null>(null);
  const defaultOrganicPostsPerAdSlot = defaultOrganicPostsPerAdSlotDraft
    ?? String(adSalesWorkspaceSettings.data?.defaultOrganicPostsPerAdSlot ?? 3);
  const [workspaceDeleteOpen, setWorkspaceDeleteOpen] = useState(false);
  const workspaceMutation = useMutation({
    mutationFn: accountApi.updateWorkspace,
    onSuccess: () => me.refetch(),
  });
  const deleteWorkspaceMutation = useMutation({
    mutationFn: workspacesApi.remove,
    onSuccess: async () => {
      const currentWorkspaceId = me.data?.workspace.id;
      const remainingWorkspaceId = workspaces?.find((workspace) => workspace.id !== currentWorkspaceId)?.id ?? '';
      if (remainingWorkspaceId) {
        localStorage.setItem('selected-workspace-id', remainingWorkspaceId);
      } else {
        localStorage.removeItem('selected-workspace-id');
      }
      setWorkspaceDeleteOpen(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['workspaces'] }),
        qc.invalidateQueries({ queryKey: ['auth', 'me'] }),
      ]);
      if (!remainingWorkspaceId && typeof window !== 'undefined') {
        window.location.reload();
      }
    },
  });
  const adSalesWorkspaceMutation = useMutation({
    mutationFn: telegramAdSalesApi.updateWorkspaceSettings,
    onSuccess: async () => {
      setDefaultOrganicPostsPerAdSlot(null);
      await qc.invalidateQueries({ queryKey: ['telegram-ad-sales', 'workspace-settings'] });
    },
  });

  useEffect(() => {
    if (!me.data?.workspace) return;
    // Query data hydrates editable workspace form fields.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWorkspaceName(me.data.workspace.name);
    setWorkspaceTimezone(me.data.workspace.timezone ?? 'Europe/Warsaw');
    setWorkspaceIconId(me.data.workspace.avatarIcon?.id ?? null);
  }, [me.data]);

  return (
    <AppShell>
      <PageHeader title="Settings" />
      {me.isLoading ? <LoadingState /> : null}
      <div className="space-y-4">
        <section>
          <WorkspaceMembersSection embedded />
        </section>
        <Card>
          <h3 className="text-lg font-semibold">Workspace</h3>
          <div className="mt-4 space-y-3">
            <div className="flex items-end gap-3">
              <InlineIconPicker iconId={workspaceIconId} icon={me.data?.workspace.avatarPresentation} onChange={setWorkspaceIconId} className="mb-0.5 shrink-0 text-2xl" />
              <div className="min-w-0 flex-1">
                <label className="mb-1 block text-sm text-neutral-300">Workspace name</label>
                <Input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm text-neutral-300">Workspace timezone</label>
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
                      timezone: workspaceTimezone.trim() || 'Europe/Warsaw',
                      avatarIconId: workspaceIconId,
                    })
                  }
                  disabled={!workspaceName.trim() || !workspaceTimezone.trim() || workspaceMutation.isPending}
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        </Card>
        <Card>
          <h3 className="text-lg font-semibold">Workspace defaults</h3>
          <p className="mt-1 text-sm text-neutral-400">
            Shared defaults live here so more global settings from different parts of the app can be added in one place.
          </p>
          <div className="mt-5 space-y-5">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
              <h4 className="text-base font-semibold text-white">Advertising sales</h4>
              <p className="mt-1 text-sm text-neutral-400">
                Default posting cadence for channels that use the workspace rule.
              </p>
              <div className="mt-4 max-w-xl">
                <label className="mb-1 block text-sm text-neutral-300">
                  Organic posts per ad opportunity
                </label>
                <Input
                  value={defaultOrganicPostsPerAdSlot}
                  onChange={(event) => setDefaultOrganicPostsPerAdSlot(event.target.value)}
                />
                <p className="mt-2 text-sm text-neutral-500">
                  Example: `3` means one ad opportunity appears after every 3 organic posts.
                </p>
              </div>
              <div className="mt-4 flex justify-end">
                <Button
                  onClick={() =>
                    adSalesWorkspaceMutation.mutate({
                      defaultOrganicPostsPerAdSlot: Number(defaultOrganicPostsPerAdSlot || 3),
                    })
                  }
                  disabled={adSalesWorkspaceMutation.isPending || !defaultOrganicPostsPerAdSlot.trim()}
                >
                  Save ad-sales defaults
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
      <ConfirmDeleteModal
        open={workspaceDeleteOpen}
        onClose={() => setWorkspaceDeleteOpen(false)}
        onConfirm={() => {
          if (!me.data?.workspace.id) return;
          return deleteWorkspaceMutation.mutateAsync(me.data.workspace.id);
        }}
        entityName={me.data?.workspace.name ?? 'workspace'}
        label="Delete workspace"
        description="This will delete your channels, transactions, accounts, categories, members, and other data in this workspace. Advertising channels, promos, and ad campaigns are kept as part of the workspace cleanup scope and will not be removed outside this workspace."
      />
    </AppShell>
  );
}
