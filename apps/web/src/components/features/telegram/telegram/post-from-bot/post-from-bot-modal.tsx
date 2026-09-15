"use client";

import { useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  TelegramPostBatch,
  TelegramSystemBotPostDraft,
} from "@telegram-system/shared";
import type { TelegramChannelNetwork } from "@/lib/api";
import type { TelegramChannelSelectOption } from "@/lib/api-types/telegram/telegram-channels";
import { telegramChannelNetworksApi, telegramSystemBotApi } from "@/lib/api";
import { useTelegramSystemBotPostFlow } from "@/hooks/use-telegram-system-bot-post-flow";
import { useWorkspaceModalDrafts } from "@/hooks/use-workspace-modal-drafts";
import { usePagination } from "@/hooks/use-pagination";
import {
  telegramPostBatchKeys,
  telegramPostKeys,
  telegramSystemBotKeys,
  networkKeys,
} from "@/lib/query-keys";
import { telegramPostBatchesApi } from "@/lib/features/telegram/telegram-post-batches-api";
import { Button, LoadingState, Modal } from "@/components/ui/primitives";
import { useI18n } from "@/providers/i18n-provider";
import { PostBatchBrowser } from "./post-batch-browser";
import { PostBatchDeliveries } from "./post-batch-deliveries";
import { PostBatchWorkspace } from "./post-batch-workspace";
import {
  addLocalPost,
  createAndDispatchPayload,
  createLocalBatch,
  importLocalPost,
} from "./post-batch-model";

export function PostFromBotModal({
  open,
  channels,
  defaultChannelId,
  onClose,
}: {
  open: boolean;
  channels: TelegramChannelSelectOption[];
  defaultChannelId?: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const pagination = usePagination({ initialPageSize: 10 });
  const [botImportTarget, setBotImportTarget] = useState<{
    postId: string;
  } | null>(null);
  const [editingLocalDraft, setEditingLocalDraft] = useState(false);
  const [localBatch, setLocalBatch] = useState(() =>
    createLocalBatch(undefined, false),
  );
  const [selection, setSelection] = useState<{
    workspaceId: string | undefined;
    batchId: string;
  }>({ workspaceId: undefined, batchId: "" });
  const connection = useQuery({
    queryKey: telegramSystemBotKeys.connection(),
    queryFn: telegramSystemBotApi.connection,
    enabled: open,
  });
  const workspaceId = connection.data?.currentWorkspaceId ?? undefined;
  const networks = useQuery<TelegramChannelNetwork[]>({
    queryKey: networkKeys.list(),
    queryFn: telegramChannelNetworksApi.list,
    enabled: open,
  });
  const batches = useQuery({
    queryKey: telegramPostBatchKeys.list({
      page: pagination.page,
      pageSize: pagination.pageSize,
    }),
    queryFn: () =>
      telegramPostBatchesApi.list({
        page: pagination.page,
        pageSize: pagination.pageSize,
      }),
    enabled: open,
    placeholderData: keepPreviousData,
  });
  const selectedBatchId =
    selection.workspaceId === workspaceId ? selection.batchId : "";
  const activeBatchId = selectedBatchId;
  const detail = useQuery({
    queryKey: telegramPostBatchKeys.detail(activeBatchId),
    queryFn: () => telegramPostBatchesApi.detail(activeBatchId),
    enabled: open && Boolean(activeBatchId),
  });

  const localDrafts = useWorkspaceModalDrafts<TelegramPostBatch>({
    namespace: workspaceId
      ? `telegram-post-batches:${workspaceId}`
      : "telegram-post-batches:unavailable",
    open,
    enabled: Boolean(workspaceId),
    value: localBatch,
    emptyValue: () => createLocalBatch(defaultChannelId),
    onRestore: (batch) => {
      setLocalBatch(batch);
      setEditingLocalDraft(true);
    },
    isMeaningful: (batch) => Boolean(batch.title.trim()),
  });
  const dispatch = useMutation({
    mutationFn: (batch: TelegramPostBatch) =>
      telegramPostBatchesApi.createAndDispatch(createAndDispatchPayload(batch)),
    onSuccess: (result) => {
      queryClient.setQueryData(
        telegramPostBatchKeys.detail(result.batch.id),
        result.batch,
      );
      void queryClient.invalidateQueries({
        queryKey: telegramPostBatchKeys.lists(),
      });
      void queryClient.invalidateQueries({
        queryKey: telegramPostBatchKeys.deliveriesRoot(result.batch.id),
      });
      void Promise.all(
        result.batch.channelIds.flatMap((channelId) => [
          queryClient.invalidateQueries({
            queryKey: telegramPostKeys.managedLists(channelId),
          }),
          queryClient.invalidateQueries({
            queryKey: telegramPostKeys.managedCalendar(channelId),
          }),
          queryClient.invalidateQueries({
            queryKey: telegramPostKeys.postGroups(channelId),
          }),
        ]),
      );
      localDrafts.clearCurrentDraft();
      setEditingLocalDraft(false);
      setSelection({ workspaceId, batchId: result.batch.id });
    },
  });
  const botFlow = useTelegramSystemBotPostFlow<TelegramSystemBotPostDraft>({
    storageKey: workspaceId
      ? `telegram-system-bot-post-batch-import:${workspaceId}`
      : undefined,
    botUsername: connection.data?.botUsername,
    prepareImport: async () =>
      (await telegramPostBatchesApi.prepareImport()).workflowId,
    readImport: async (workflowId) => {
      const result = await telegramPostBatchesApi.importResult(workflowId);
      if (!result.ready) return { ready: false };
      if (result.drafts.length !== 1)
        throw new Error("Send exactly one post through the bot");
      return { ready: true, value: result.drafts[0] };
    },
    onImported: (imported) => {
      const target = botImportTarget;
      if (!target) return;
      setLocalBatch((batch) => importLocalPost(batch, target.postId, imported));
      setBotImportTarget(null);
    },
    importErrorMessage: t("telegram.posts.batch.importReadError"),
    startImportErrorMessage: t("telegram.posts.batch.importStartError"),
  });

  const close = () => {
    setSelection({ workspaceId, batchId: "" });
    if (editingLocalDraft) localDrafts.showDraftPicker();
    setEditingLocalDraft(false);
    onClose();
  };
  const closeEditor = () => {
    setSelection({ workspaceId, batchId: "" });
    if (editingLocalDraft) localDrafts.showDraftPicker();
    setEditingLocalDraft(false);
  };
  const connected = connection.data?.connected === true;
  const botUsername = connection.data?.botUsername?.replace(/^@+/, "") ?? "";

  return (
    <>
      <Modal
        open={open && !activeBatchId && !editingLocalDraft}
        onClose={close}
        title={t("telegram.posts.batch.modalTitle")}
        size="xl"
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 sm:px-5">
          {!connected && !connection.isLoading ? (
            <div className="mb-4 rounded-lg border border-amber-900/70 bg-amber-950/20 p-3 text-sm text-amber-100">
              <p>{t("telegram.posts.batch.connectBotHint")}</p>
              {botUsername ? (
                <a
                  href={`https://t.me/${encodeURIComponent(botUsername)}?start=connect`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex font-medium text-blue-300 hover:text-blue-200"
                >
                  {t("telegram.posts.batch.connectBot")}
                </a>
              ) : null}
            </div>
          ) : null}
          {dispatch.error ? (
            <p
              role="alert"
              className="mb-4 rounded-lg bg-rose-950/30 p-3 text-sm text-rose-200"
            >
              {t("telegram.posts.batch.dispatchError")}
            </p>
          ) : null}
          <div className="space-y-4">
            <PostBatchBrowser
              data={batches.data}
              loading={batches.isLoading}
              error={Boolean(batches.error)}
              fetching={batches.isFetching}
              canCreate={Boolean(workspaceId)}
              drafts={localDrafts.pendingDrafts}
              onCreate={localDrafts.createNewDraft}
              onOpen={(batch) =>
                setSelection({ workspaceId, batchId: batch.id })
              }
              onContinueDraft={localDrafts.continueDraft}
              onDeleteDraft={(draft) => {
                localDrafts.deleteDraft(draft);
                setEditingLocalDraft(false);
              }}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
            />
          </div>
        </div>
      </Modal>
      <Modal
        open={open && (Boolean(activeBatchId) || editingLocalDraft)}
        onClose={close}
        title={
          editingLocalDraft
            ? localBatch.title
            : (detail.data?.title ?? t("telegram.posts.batch.modalTitle"))
        }
        size="xl"
        leadingHeaderAction={
          <button
            type="button"
            onClick={closeEditor}
            aria-label={t("telegram.posts.batch.backToList")}
            className="rounded-lg border border-neutral-700 p-2 text-neutral-300 hover:bg-neutral-800 hover:text-white"
          >
            <ArrowLeft size={16} />
          </button>
        }
      >
        <main className="min-w-0 space-y-4">
          {botFlow.error ? (
            <p
              role="alert"
              className="rounded-lg bg-rose-950/30 p-3 text-sm text-rose-200"
            >
              {botFlow.error}
            </p>
          ) : null}
          {botFlow.importStatus === "done" ? (
            <p className="rounded-lg bg-emerald-950/30 p-3 text-sm text-emerald-200">
              {t("telegram.posts.batch.imported")}
            </p>
          ) : null}
          {botFlow.importStatus === "waiting" ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-900/60 bg-blue-950/20 p-3 text-sm text-blue-100">
              <span>{t("telegram.posts.batch.waitingForBotHint")}</span>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void botFlow.checkImport()}
              >
                <RefreshCw size={16} />
                {t("telegram.posts.batch.checkAgain")}
              </Button>
            </div>
          ) : null}
          {dispatch.error ? (
            <p
              role="alert"
              className="rounded-lg bg-rose-950/30 p-3 text-sm text-rose-200"
            >
              {t("telegram.posts.batch.dispatchError")}
            </p>
          ) : null}
          {!editingLocalDraft && detail.isLoading ? <LoadingState /> : null}
          {!editingLocalDraft && detail.error ? (
            <p
              role="alert"
              className="rounded-lg bg-rose-950/30 p-3 text-sm text-rose-200"
            >
              {t("telegram.posts.batch.detailError")}
            </p>
          ) : null}
          {editingLocalDraft ? (
            <PostBatchWorkspace
              key={localBatch.id}
              batch={localBatch}
              channels={channels}
              networks={networks.data ?? []}
              saving={false}
              dispatching={dispatch.isPending}
              botImportingPostId={
                botFlow.importStatus === "working" ||
                botFlow.importStatus === "waiting"
                  ? botImportTarget?.postId
                  : null
              }
              canImportFromBot={connected}
              onSave={async () => undefined}
              onDispatch={async (batch) => {
                await dispatch.mutateAsync(batch);
              }}
              onAddPost={async (batch) => addLocalPost(batch)}
              onDraftChange={setLocalBatch}
              onImportPostFromBot={(postId) => {
                setBotImportTarget({ postId });
                void botFlow.startImport();
              }}
            />
          ) : detail.data ? (
            <>
              <PostBatchWorkspace
                key={`${detail.data.id}:${detail.data.version}`}
                batch={detail.data}
                channels={channels}
                networks={networks.data ?? []}
                saving={false}
                dispatching={dispatch.isPending}
                botImportingPostId={
                  botFlow.importStatus === "working" ||
                  botFlow.importStatus === "waiting"
                    ? botImportTarget?.postId
                    : null
                }
                canImportFromBot={connected}
                onSave={async () => undefined}
                onDispatch={async () => undefined}
                onAddPost={async (batch) => batch}
              />
              {detail.data.deliveryCount > 0 ||
              detail.data.status !== "DRAFT" ? (
                <PostBatchDeliveries batchId={detail.data.id} />
              ) : null}
            </>
          ) : null}
        </main>
      </Modal>
    </>
  );
}
