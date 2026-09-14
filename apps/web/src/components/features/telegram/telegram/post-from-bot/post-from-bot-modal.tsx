"use client";

import { useState } from "react";
import { Bot, LoaderCircle, RefreshCw } from "lucide-react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  LinkTelegramPostBatchPayload,
  TelegramPostBatch,
} from "@telegram-system/shared";
import type { TelegramChannelSelectOption } from "@/lib/api-types/telegram/telegram-channels";
import { telegramSystemBotApi } from "@/lib/api";
import { useTelegramSystemBotPostFlow } from "@/hooks/use-telegram-system-bot-post-flow";
import { usePagination } from "@/hooks/use-pagination";
import {
  telegramPostBatchKeys,
  telegramPostKeys,
  telegramSystemBotKeys,
} from "@/lib/query-keys";
import { telegramPostBatchesApi } from "@/lib/features/telegram/telegram-post-batches-api";
import {
  Button,
  EmptyState,
  LoadingState,
  Modal,
} from "@/components/ui/primitives";
import { Pagination } from "@/components/ui/pagination";
import { useI18n } from "@/providers/i18n-provider";
import { PostBatchAssociations } from "./post-batch-associations";
import { PostBatchDeliveries } from "./post-batch-deliveries";
import { PostBatchEditor } from "./post-batch-editor";
import { updatePayload } from "./post-batch-model";

function batchTimestamp(value: string, locale: "en" | "ru") {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function PostFromBotModal({
  open,
  channels,
  onClose,
}: {
  open: boolean;
  channels: TelegramChannelSelectOption[];
  onClose: () => void;
}) {
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();
  const pagination = usePagination({ initialPageSize: 10 });
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
  const activeBatchId = selectedBatchId || batches.data?.items[0]?.id || "";
  const detail = useQuery({
    queryKey: telegramPostBatchKeys.detail(activeBatchId),
    queryFn: () => telegramPostBatchesApi.detail(activeBatchId),
    enabled: open && Boolean(activeBatchId),
  });

  const update = useMutation({
    mutationFn: ({ batch }: { batch: TelegramPostBatch }) =>
      telegramPostBatchesApi.update(batch.id, updatePayload(batch)),
    onSuccess: (batch) => {
      queryClient.setQueryData(telegramPostBatchKeys.detail(batch.id), batch);
      void queryClient.invalidateQueries({
        queryKey: telegramPostBatchKeys.lists(),
      });
    },
  });
  const dispatch = useMutation({
    mutationFn: async (batch: TelegramPostBatch) => {
      const saved = await telegramPostBatchesApi.update(
        batch.id,
        updatePayload(batch),
      );
      queryClient.setQueryData(
        telegramPostBatchKeys.detail(saved.id),
        saved,
      );
      try {
        return await telegramPostBatchesApi.dispatch(saved.id, saved.version);
      } catch (error) {
        await queryClient.invalidateQueries({
          queryKey: telegramPostBatchKeys.detail(saved.id),
        });
        throw error;
      }
    },
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
    },
  });
  const link = useMutation({
    mutationFn: (payload: LinkTelegramPostBatchPayload) =>
      telegramPostBatchesApi.link(activeBatchId, payload),
    onSuccess: (batch) => {
      queryClient.setQueryData(telegramPostBatchKeys.detail(batch.id), batch);
    },
  });

  const botFlow = useTelegramSystemBotPostFlow<TelegramPostBatch>({
    storageKey: workspaceId
      ? `telegram-system-bot-post-batch-import:${workspaceId}`
      : undefined,
    botUsername: connection.data?.botUsername,
    prepareImport: async () =>
      (await telegramPostBatchesApi.prepareImport()).workflowId,
    readImport: async (workflowId) => {
      const result = await telegramPostBatchesApi.importResult(workflowId);
      if (!result.ready) return { ready: false };
      const batch = await telegramPostBatchesApi.importWorkflow(workflowId);
      return { ready: true, value: batch };
    },
    onImported: (batch) => {
      queryClient.setQueryData(telegramPostBatchKeys.detail(batch.id), batch);
      setSelection({ workspaceId, batchId: batch.id });
      pagination.resetPage();
      void queryClient.invalidateQueries({
        queryKey: telegramPostBatchKeys.lists(),
      });
    },
    importErrorMessage: t("telegram.posts.batch.importReadError"),
    startImportErrorMessage: t("telegram.posts.batch.importStartError"),
  });

  const close = () => {
    onClose();
  };
  const connected = connection.data?.connected === true;
  const botUsername = connection.data?.botUsername?.replace(/^@+/, "") ?? "";

  return (
    <Modal
      open={open}
      onClose={close}
      title={t("telegram.posts.batch.modalTitle")}
      size="xl"
      headerAction={
        <Button
          type="button"
          disabled={
            !connected ||
            botFlow.importStatus === "working" ||
            botFlow.importStatus === "waiting"
          }
          onClick={() => void botFlow.startImport()}
        >
          {botFlow.importStatus === "working" ||
          botFlow.importStatus === "waiting" ? (
            <LoaderCircle size={16} className="animate-spin" />
          ) : (
            <Bot size={16} />
          )}
          {botFlow.importStatus === "working"
            ? t("telegram.posts.batch.preparingBot")
            : botFlow.importStatus === "waiting"
              ? t("telegram.posts.batch.waitingForBot")
              : t("telegram.posts.batch.startBotImport")}
        </Button>
      }
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
        {botFlow.error ? (
          <p
            role="alert"
            className="mb-4 rounded-lg bg-rose-950/30 p-3 text-sm text-rose-200"
          >
            {botFlow.error}
          </p>
        ) : null}
        {dispatch.error ? (
          <p
            role="alert"
            className="mb-4 rounded-lg bg-rose-950/30 p-3 text-sm text-rose-200"
          >
            {t("telegram.posts.batch.dispatchError")}
          </p>
        ) : null}
        {botFlow.importStatus === "done" ? (
          <p className="mb-4 rounded-lg bg-emerald-950/30 p-3 text-sm text-emerald-200">
            {t("telegram.posts.batch.imported")}
          </p>
        ) : null}
        {botFlow.importStatus === "waiting" ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-900/60 bg-blue-950/20 p-3 text-sm text-blue-100">
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

        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="min-w-0 rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h4 className="font-medium text-white">
                {t("telegram.posts.batch.recentBatches")}
              </h4>
              <button
                type="button"
                aria-label={t("telegram.posts.batch.refreshBatches")}
                disabled={batches.isFetching}
                onClick={() => void batches.refetch()}
                className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white disabled:opacity-50"
              >
                <RefreshCw
                  size={16}
                  className={batches.isFetching ? "animate-spin" : ""}
                />
              </button>
            </div>
            {batches.isLoading ? <LoadingState /> : null}
            {batches.error ? (
              <p role="alert" className="text-sm text-rose-300">
                {t("telegram.posts.batch.listError")}
              </p>
            ) : null}
            {batches.data && !batches.data.items.length ? (
              <EmptyState text={t("telegram.posts.batch.noBatches")} />
            ) : null}
            <div className="space-y-2">
              {batches.data?.items.map((batch) => (
                <button
                  key={batch.id}
                  type="button"
                  onClick={() =>
                    setSelection({ workspaceId, batchId: batch.id })
                  }
                  className={`w-full rounded-lg border p-3 text-left transition ${activeBatchId === batch.id ? "border-blue-700 bg-blue-950/30" : "border-neutral-800 bg-neutral-900/60 hover:border-neutral-700"}`}
                >
                  <span className="block truncate text-sm font-medium text-white">
                    {batch.title}
                  </span>
                  <span className="mt-1 block text-xs text-neutral-400">
                    {t("telegram.posts.batch.listMeta", {
                      posts: batch.postCount,
                      channels: batch.channelCount,
                    })}
                  </span>
                  <span className="mt-1 block text-xs text-neutral-500">
                    {batchTimestamp(batch.updatedAt, locale)} · {batch.status}
                  </span>
                </button>
              ))}
            </div>
            {batches.data ? (
              <Pagination
                page={batches.data.pagination.page}
                pageSize={batches.data.pagination.pageSize}
                totalItems={batches.data.pagination.totalItems}
                totalPages={batches.data.pagination.totalPages}
                hasNextPage={
                  batches.data.pagination.page <
                  batches.data.pagination.totalPages
                }
                hasPreviousPage={batches.data.pagination.page > 1}
                onPageChange={pagination.setPage}
                onPageSizeChange={pagination.setPageSize}
                loading={batches.isFetching}
                pageSizeOptions={[10, 25]}
              />
            ) : null}
          </aside>

          <main className="min-w-0 space-y-4">
            {activeBatchId && detail.isLoading ? <LoadingState /> : null}
            {detail.error ? (
              <p
                role="alert"
                className="rounded-lg bg-rose-950/30 p-3 text-sm text-rose-200"
              >
                {t("telegram.posts.batch.detailError")}
              </p>
            ) : null}
            {detail.data ? (
              <>
                <PostBatchEditor
                  key={`${detail.data.id}:${detail.data.version}`}
                  batch={detail.data}
                  channels={channels}
                  saving={update.isPending}
                  dispatching={dispatch.isPending}
                  onSave={async (batch) => {
                    await update.mutateAsync({ batch });
                  }}
                  onDispatch={async (batch) => {
                    await dispatch.mutateAsync(batch);
                  }}
                />
                <PostBatchAssociations
                  batch={detail.data}
                  linking={link.isPending}
                  onLink={async (payload) => {
                    await link.mutateAsync(payload);
                  }}
                />
                {detail.data.deliveryCount > 0 ||
                detail.data.status !== "DRAFT" ? (
                  <PostBatchDeliveries batchId={detail.data.id} />
                ) : null}
              </>
            ) : null}
          </main>
        </div>
      </div>
    </Modal>
  );
}
