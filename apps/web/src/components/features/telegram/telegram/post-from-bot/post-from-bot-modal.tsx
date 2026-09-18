"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { TelegramPostBatch } from "@telegram-system/shared";
import type { TelegramChannelNetwork } from "@/lib/api";
import type { TelegramChannelSelectOption } from "@/lib/api-types/telegram/telegram-channels";
import { telegramChannelNetworksApi, telegramSystemBotApi } from "@/lib/api";
import { useTelegramSystemBotPostFlow } from "@/hooks/use-telegram-system-bot-post-flow";
import { useWorkspaceModalDrafts } from "@/hooks/use-workspace-modal-drafts";
import { selectedWorkspaceDraftScope } from "@/lib/workspace-modal-drafts";
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
  hasMeaningfulLocalBatch,
  importLocalPost,
  importLocalPosts,
} from "./post-batch-model";

type BotImportTarget = {
  kind: "single" | "multiple";
  postIds: string[];
};

function parseBotImportTarget(value: string | null): BotImportTarget | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<BotImportTarget>;
    if (
      (parsed.kind === "single" || parsed.kind === "multiple") &&
      Array.isArray(parsed.postIds) &&
      parsed.postIds.every((postId) => typeof postId === "string")
    ) {
      return { kind: parsed.kind, postIds: parsed.postIds };
    }
  } catch {
    return { kind: "single", postIds: [value] };
  }
  return null;
}

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
  const [botImportTarget, setBotImportTarget] =
    useState<BotImportTarget | null>(null);
  const [startingBotImportPostId, setStartingBotImportPostId] = useState<
    string | null
  >(null);
  const [botImportRevision, setBotImportRevision] = useState(0);
  const [lastImportedPostId, setLastImportedPostId] = useState<string | null>(
    null,
  );
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
  const botTargetStorageKey = workspaceId
    ? `post-from-bot-import-target:${workspaceId}`
    : undefined;
  useEffect(() => {
    if (!open || !botTargetStorageKey) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const target = parseBotImportTarget(
        window.localStorage.getItem(botTargetStorageKey),
      );
      if (target) setBotImportTarget(target);
    });
    return () => {
      cancelled = true;
    };
  }, [botTargetStorageKey, open]);
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
    namespace: "telegram-post-batches:draft",
    workspaceId: workspaceId ?? selectedWorkspaceDraftScope(),
    schemaVersion: 1,
    legacyKeys: workspaceId
      ? [`telegram-post-batches:${workspaceId}:${workspaceId}`]
      : [],
    open,
    enabled: Boolean(workspaceId),
    value: localBatch,
    createInitialValue: () => createLocalBatch(defaultChannelId),
    onRestore: (batch) => {
      setLocalBatch(batch);
      setEditingLocalDraft(true);
    },
    isMeaningful: hasMeaningfulLocalBatch,
    previewFor: (batch) => ({
      title: batch.title || "Untitled post batch",
      subtitle: `${batch.posts.length} posts · ${batch.channelIds.length} channels`,
      avatars: channels
        .filter((channel) => batch.channelIds.includes(channel.id))
        .map((channel) => ({
          label: channel.title,
          imageUrl: channel.photoUrl,
        })),
    }),
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
  const botFlow = useTelegramSystemBotPostFlow({
    mode: "multiple",
    recoveryKey: "post-from-bot",
    importContext: "Mass publication",
    workspaceId,
    botUsername: connection.data?.botUsername,
    enabled: open,
    onImported: (imported) => {
      const target =
        parseBotImportTarget(
          botTargetStorageKey
            ? window.localStorage.getItem(botTargetStorageKey)
            : null,
        ) ?? botImportTarget;
      if (!target) return;
      if (target.kind === "single") {
        const postId = target.postIds[0];
        const first = imported[0];
        if (!postId || !first) return;
        setLocalBatch((batch) => importLocalPost(batch, postId, first));
        setLastImportedPostId(postId);
      } else {
        const result = importLocalPosts(localBatch, target.postIds, imported);
        setLocalBatch(result.batch);
        setLastImportedPostId(result.importedPostIds.at(-1) ?? null);
      }
      setBotImportRevision((revision) => revision + 1);
      setBotImportTarget(null);
      if (botTargetStorageKey)
        window.localStorage.removeItem(botTargetStorageKey);
    },
    errorCopy: {
      read: t("telegram.posts.batch.importReadError"),
      start: t("telegram.posts.batch.importStartError"),
    },
  });
  useEffect(() => {
    if (botFlow.terminalStatus && botTargetStorageKey)
      window.localStorage.removeItem(botTargetStorageKey);
  }, [botFlow.terminalStatus, botTargetStorageKey]);
  const startBotImport = async (target: BotImportTarget) => {
    setStartingBotImportPostId(
      target.kind === "single" ? (target.postIds[0] ?? null) : "all",
    );
    try {
      const started = await botFlow.startImport();
      if (!started) return;
      setBotImportTarget(target);
      if (botTargetStorageKey)
        window.localStorage.setItem(
          botTargetStorageKey,
          JSON.stringify(target),
        );
    } finally {
      setStartingBotImportPostId(null);
    }
  };
  const startBotImportForPost = (postId: string) =>
    startBotImport({ kind: "single", postIds: [postId] });
  const startBotImportForBatch = (postIds: string[]) =>
    startBotImport({ kind: "multiple", postIds });

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
            <div className="flex justify-end">
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
              key={`${localBatch.id}:${botImportRevision}`}
              batch={localBatch}
              initialSelectedPostId={lastImportedPostId}
              channels={channels}
              networks={networks.data ?? []}
              saving={false}
              dispatching={dispatch.isPending}
              botImportingPostId={
                botFlow.importStatus === "working"
                  ? startingBotImportPostId === "all"
                    ? null
                    : startingBotImportPostId
                  : botFlow.importStatus === "waiting" &&
                      botImportTarget?.kind === "single"
                    ? (botImportTarget.postIds[0] ?? null)
                    : null
              }
              botImportingAll={
                (botFlow.importStatus === "working" &&
                  startingBotImportPostId === "all") ||
                (botFlow.importStatus === "waiting" &&
                  botImportTarget?.kind === "multiple")
              }
              canImportFromBot={connected}
              onSave={async () => undefined}
              onDispatch={async (batch) => {
                await dispatch.mutateAsync(batch);
              }}
              onAddPost={async (batch) => addLocalPost(batch)}
              onDraftChange={setLocalBatch}
              onImportPostFromBot={(postId) => {
                void startBotImportForPost(postId);
              }}
              onImportPostsFromBot={(postIds) => {
                void startBotImportForBatch(postIds);
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
                    ? botImportTarget?.kind === "single"
                      ? (botImportTarget.postIds[0] ?? null)
                      : null
                    : null
                }
                botImportingAll={
                  (botFlow.importStatus === "working" ||
                    botFlow.importStatus === "waiting") &&
                  botImportTarget?.kind === "multiple"
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
