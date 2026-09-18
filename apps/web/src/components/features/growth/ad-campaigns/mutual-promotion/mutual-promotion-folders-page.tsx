"use client";

import { type ReactNode, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import type {
  CreateMutualPromotionFolderPayload,
  CreateMutualPromotionPostPayload,
  MutualPromotionExpensePayload,
  MutualPromotionFolderDetail,
  UpdateMutualPromotionPostPayload,
} from "@telegram-system/shared";
import {
  accountsApi,
  authApi,
  telegramChannelsApi,
  telegramSystemBotApi,
} from "@/lib/api";
import { mutualPromotionFoldersApi } from "@/lib/features/growth/mutual-promotion-folders-api";
import {
  accountKeys,
  authKeys,
  mutualPromotionFolderKeys,
  telegramChannelKeys,
  telegramSystemBotKeys,
} from "@/lib/query-keys";
import { AppShell } from "@/components/layout/app-shell";
import { PageTabHead } from "@/components/layout/page-tab-head";
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  PageHeader,
  ConfirmDeleteModal,
} from "@/components/ui/primitives";
import { MutualPromotionFolderFormModal } from "./mutual-promotion-folder-form-modal";
import { MutualPromotionFolderDetailModal } from "./mutual-promotion-folder-detail-modal";
import { MutualPromotionFolderDetailSkeletonModal } from "./mutual-promotion-folder-detail-skeleton-modal";
import { MutualPromotionInviteLinksEditor } from "./mutual-promotion-invite-links-editor";
import { MutualPromotionFolderCard } from "./mutual-promotion-folder-card";
import { useAppToast } from "@/providers/toast-provider";
import { adsSectionHeader } from "../ads-section-header";

const listParams = { page: 1, pageSize: 100 } as const;

export function MutualPromotionFoldersPage({
  sectionTabs,
}: {
  sectionTabs?: ReactNode;
}) {
  const queryClient = useQueryClient();
  const { setProgress } = useAppToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editingFolder, setEditingFolder] =
    useState<MutualPromotionFolderDetail | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [inviteLinksEditorOpen, setInviteLinksEditorOpen] = useState(false);
  const [deleteFolder, setDeleteFolder] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const foldersQuery = useQuery({
    queryKey: mutualPromotionFolderKeys.list(listParams),
    queryFn: () => mutualPromotionFoldersApi.list(listParams),
  });
  const detailQuery = useQuery({
    queryKey: mutualPromotionFolderKeys.detail(selectedFolderId ?? ""),
    queryFn: () => mutualPromotionFoldersApi.get(selectedFolderId!),
    enabled: Boolean(selectedFolderId),
  });
  const resourcesEnabled = formOpen || Boolean(selectedFolderId);
  const meQuery = useQuery({
    queryKey: authKeys.me(),
    queryFn: authApi.me,
    staleTime: 5 * 60_000,
  });
  const workspaceTimezone = meQuery.data?.workspace.timezone || "Europe/Warsaw";
  const channelsQuery = useQuery({
    queryKey: telegramChannelKeys.select({ owned: true }),
    queryFn: () => telegramChannelsApi.select({ owned: true }),
    enabled: resourcesEnabled,
    staleTime: 60_000,
  });
  const accountsQuery = useQuery({
    queryKey: accountKeys.accounts(),
    queryFn: accountsApi.list,
    enabled: resourcesEnabled,
    staleTime: 60_000,
  });
  const systemBotQuery = useQuery({
    queryKey: telegramSystemBotKeys.connection(),
    queryFn: telegramSystemBotApi.connection,
    enabled: Boolean(selectedFolderId),
    staleTime: 60_000,
    refetchOnWindowFocus: "always",
  });

  const reconcile = async (folder: MutualPromotionFolderDetail) => {
    queryClient.setQueryData(
      mutualPromotionFolderKeys.detail(folder.id),
      folder,
    );
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: mutualPromotionFolderKeys.list(listParams),
      }),
      queryClient.invalidateQueries({ queryKey: telegramChannelKeys.lists() }),
      queryClient.invalidateQueries({
        queryKey: telegramChannelKeys.trafficAttributions(),
      }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: async (payload: CreateMutualPromotionFolderPayload) =>
      editingFolder
        ? mutualPromotionFoldersApi.update(editingFolder.id, payload)
        : mutualPromotionFoldersApi.create(payload),
    onSuccess: async (folder) => {
      await reconcile(folder);
      setFormOpen(false);
      setEditingFolder(null);
      setSelectedFolderId(folder.id);
    },
  });
  const activateMutation = useMutation({
    mutationFn: async ({
      folderId,
      expectedTotal,
    }: {
      folderId: string;
      expectedTotal: number;
    }) => {
      const progressId = `mutual-promotion-activation:${folderId}`;
      let successCount = 0;
      let failedCount = 0;
      let total = expectedTotal;
      setProgress({
        id: progressId,
        title: "Activating mutual-promotion folder",
        current: 0,
        total,
        successCount,
        failedCount,
        message: `Preparing ${total} channel publications…`,
        iconEmoji: "🤝",
      });
      try {
        const result = await mutualPromotionFoldersApi.activate(
          folderId,
          (item, current, streamTotal) => {
            total = streamTotal;
            if (item.status === "SCHEDULED" && item.success) successCount += 1;
            if (item.status === "FAILED") failedCount += 1;
            setProgress({
              id: progressId,
              title: "Activating mutual-promotion folder",
              current,
              total,
              successCount,
              failedCount,
              message: item.message,
              iconEmoji: "🤝",
            });
          },
        );
        setProgress({
          id: progressId,
          title: "Mutual-promotion folder activated",
          current: total,
          total,
          completed: true,
          successCount: result.successCount,
          failedCount: result.failedCount,
          skippedCount: 0,
          message: `${result.successCount}/${total} channel publications scheduled successfully.`,
          iconEmoji: "🤝",
        });
        return result;
      } catch (error) {
        setProgress({
          id: progressId,
          title: "Folder activation finished with errors",
          current: successCount + failedCount,
          total,
          completed: true,
          successCount,
          failedCount: Math.max(1, failedCount),
          skippedCount: Math.max(
            0,
            total - successCount - Math.max(1, failedCount),
          ),
          message: `${successCount} successful · ${Math.max(1, failedCount)} failed`,
          iconEmoji: "🤝",
        });
        throw error;
      }
    },
    onSuccess: ({ folder }) => reconcile(folder),
  });
  const cancelMutation = useMutation({
    mutationFn: (folderId: string) =>
      mutualPromotionFoldersApi.cancel(folderId),
    onSuccess: reconcile,
  });
  const deleteMutation = useMutation({
    mutationFn: (folderId: string) =>
      mutualPromotionFoldersApi.remove(folderId),
    onSuccess: ({ id }) => {
      queryClient.setQueryData(
        mutualPromotionFolderKeys.list(listParams),
        (current: typeof foldersQuery.data) =>
          current
            ? {
                ...current,
                items: current.items.filter((item) => item.id !== id),
                pagination: {
                  ...current.pagination,
                  totalItems: Math.max(0, current.pagination.totalItems - 1),
                },
              }
            : current,
      );
      if (selectedFolderId === id) setSelectedFolderId(null);
      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: telegramChannelKeys.lists(),
        }),
        queryClient.invalidateQueries({
          queryKey: telegramChannelKeys.trafficAttributions(),
        }),
      ]);
    },
  });
  const addPostMutation = useMutation({
    mutationFn: ({
      folderId,
      payload,
    }: {
      folderId: string;
      payload: CreateMutualPromotionPostPayload;
    }) => mutualPromotionFoldersApi.addPost(folderId, payload),
    onSuccess: reconcile,
  });
  const removePostMutation = useMutation({
    mutationFn: ({ folderId, postId }: { folderId: string; postId: string }) =>
      mutualPromotionFoldersApi.removePost(folderId, postId),
    onSuccess: reconcile,
  });
  const updatePostMutation = useMutation({
    mutationFn: ({
      folderId,
      postId,
      payload,
    }: {
      folderId: string;
      postId: string;
      payload: UpdateMutualPromotionPostPayload;
    }) => mutualPromotionFoldersApi.updatePost(folderId, postId, payload),
    onSuccess: reconcile,
  });
  const expenseMutation = useMutation({
    mutationFn: ({
      folderId,
      participantId,
      payload,
    }: {
      folderId: string;
      participantId: string;
      payload: MutualPromotionExpensePayload;
    }) =>
      mutualPromotionFoldersApi.upsertExpense(folderId, participantId, payload),
    onSuccess: reconcile,
  });

  const folder =
    detailQuery.data?.id === selectedFolderId ? detailQuery.data : null;
  const selectedFolderTitle = foldersQuery.data?.items.find(
    (item) => item.id === selectedFolderId,
  )?.title;
  const mutating =
    activateMutation.isPending ||
    cancelMutation.isPending ||
    addPostMutation.isPending ||
    updatePostMutation.isPending ||
    removePostMutation.isPending ||
    expenseMutation.isPending;
  const actionError =
    activateMutation.isError ||
    cancelMutation.isError ||
    updatePostMutation.isError ||
    removePostMutation.isError ||
    expenseMutation.isError
      ? "The folder action could not be completed. Check its current status and try again."
      : null;
  const header = adsSectionHeader("mutual-folders");

  return (
    <AppShell>
      <PageTabHead title="Mutual promotion" emoji="🤝" color="#2563eb" />
      <PageHeader
        title={header.title}
        subtitle={header.subtitle}
        action={
          <Button
            type="button"
            className="h-11 px-5"
            onClick={() => {
              setEditingFolder(null);
              setFormOpen(true);
            }}
          >
            <Plus size={18} /> {header.actionLabel}
          </Button>
        }
      />
      {sectionTabs}

      {foldersQuery.isLoading ? (
        <LoadingState text="Loading mutual-promotion folders…" />
      ) : null}
      {foldersQuery.isError ? (
        <ErrorState text="Could not load mutual-promotion folders." />
      ) : null}
      {foldersQuery.data && !foldersQuery.data.items.length ? (
        <EmptyState text="No mutual-promotion folders yet. Create one to prepare channels and publications." />
      ) : null}
      {foldersQuery.data?.items.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {foldersQuery.data.items.map((item) => (
            <MutualPromotionFolderCard
              key={item.id}
              folder={item}
              now={now}
              onOpen={() => setSelectedFolderId(item.id)}
              onEdit={() => {
                setSelectedFolderId(item.id);
                void mutualPromotionFoldersApi.get(item.id).then((detail) => {
                  setEditingFolder(detail);
                  setSelectedFolderId(null);
                  setFormOpen(true);
                });
              }}
              onDelete={() =>
                setDeleteFolder({ id: item.id, title: item.title })
              }
            />
          ))}
        </div>
      ) : null}

      {formOpen ? (
        <MutualPromotionFolderFormModal
          key={`${editingFolder?.id ?? "new"}:${workspaceTimezone}`}
          open
          folder={editingFolder}
          timezone={workspaceTimezone}
          channels={channelsQuery.data ?? []}
          accounts={accountsQuery.data ?? []}
          resourcesLoading={
            meQuery.isLoading ||
            channelsQuery.isLoading ||
            accountsQuery.isLoading
          }
          resourcesError={
            meQuery.isError || channelsQuery.isError || accountsQuery.isError
          }
          saving={saveMutation.isPending}
          onClose={() => {
            setFormOpen(false);
            setEditingFolder(null);
          }}
          onSubmit={(payload) =>
            saveMutation.mutateAsync(payload).then(() => undefined)
          }
        />
      ) : null}

      <MutualPromotionFolderDetailSkeletonModal
        open={Boolean(
          selectedFolderId &&
          !folder &&
          (detailQuery.isLoading || detailQuery.isFetching),
        )}
        title={selectedFolderTitle}
        onClose={() => setSelectedFolderId(null)}
      />
      <Modal
        open={Boolean(selectedFolderId && detailQuery.isError)}
        onClose={() => setSelectedFolderId(null)}
        title="Folder unavailable"
        size="sm"
      >
        <ErrorState text="Could not load this mutual-promotion folder." />
        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setSelectedFolderId(null)}
          >
            Close
          </Button>
        </div>
      </Modal>
      <MutualPromotionFolderDetailModal
        key={selectedFolderId ?? "closed"}
        open={Boolean(selectedFolderId && folder && !inviteLinksEditorOpen)}
        folder={folder}
        timezone={workspaceTimezone}
        accounts={accountsQuery.data ?? []}
        botConnected={systemBotQuery.data?.connected ?? false}
        botUsername={systemBotQuery.data?.botUsername ?? null}
        workspaceId={systemBotQuery.data?.currentWorkspaceId}
        mutating={mutating}
        actionError={actionError}
        onClose={() => {
          setInviteLinksEditorOpen(false);
          setSelectedFolderId(null);
        }}
        onEdit={() => {
          if (!folder) return;
          setEditingFolder(folder);
          setSelectedFolderId(null);
          setFormOpen(true);
        }}
        onEditInviteLinks={() => {
          setInviteLinksEditorOpen(true);
        }}
        onActivate={() =>
          activateMutation
            .mutateAsync({
              folderId: folder!.id,
              expectedTotal: folder!.postCount * folder!.publisherCount,
            })
            .then(() => undefined)
        }
        onCancel={() =>
          cancelMutation.mutateAsync(folder!.id).then(() => undefined)
        }
        onAddPost={(payload) =>
          addPostMutation
            .mutateAsync({ folderId: folder!.id, payload })
            .then(() => undefined)
        }
        onUpdatePost={(postId, payload) =>
          updatePostMutation
            .mutateAsync({ folderId: folder!.id, postId, payload })
            .then(() => undefined)
        }
        onRemovePost={(postId) =>
          removePostMutation
            .mutateAsync({ folderId: folder!.id, postId })
            .then(() => undefined)
        }
        onSaveExpense={(participantId, payload) =>
          expenseMutation
            .mutateAsync({ folderId: folder!.id, participantId, payload })
            .then(() => undefined)
        }
      />
      {inviteLinksEditorOpen ? (
        <MutualPromotionInviteLinksEditor
          folder={folder}
          open
          onClose={() => setInviteLinksEditorOpen(false)}
          onSaved={reconcile}
        />
      ) : null}
      <ConfirmDeleteModal
        open={Boolean(deleteFolder)}
        onClose={() => setDeleteFolder(null)}
        entityName={deleteFolder?.title ?? "folder"}
        description="The folder and its linked managed posts will be deleted. Published or scheduled Telegram copies will be removed first."
        onConfirm={async () => {
          if (!deleteFolder) return;
          await deleteMutation.mutateAsync(deleteFolder.id);
          setDeleteFolder(null);
        }}
      />
    </AppShell>
  );
}
