"use client";

import { Plus } from "lucide-react";
import type {
  TelegramPostBatch,
  TelegramPostBatchListResponse,
  TelegramPostBatchSummary,
} from "@telegram-system/shared";
import type { WorkspaceFormDraft } from "@/hooks/use-workspace-modal-drafts";
import {
  Button,
  EmptyState,
  IconButton,
  LoadingState,
} from "@/components/ui/primitives";
import { Pagination } from "@/components/ui/pagination";
import { useI18n } from "@/providers/i18n-provider";

function batchTimestamp(value: string, locale: "en" | "ru") {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function PostBatchBrowser({
  data,
  loading,
  error,
  fetching,
  canCreate,
  drafts,
  onCreate,
  onOpen,
  onContinueDraft,
  onDeleteDraft,
  onPageChange,
  onPageSizeChange,
}: {
  data?: TelegramPostBatchListResponse;
  loading: boolean;
  error: boolean;
  fetching: boolean;
  canCreate: boolean;
  drafts: WorkspaceFormDraft<TelegramPostBatch>[];
  onCreate: () => void;
  onOpen: (batch: TelegramPostBatchSummary) => void;
  onContinueDraft: (draft: WorkspaceFormDraft<TelegramPostBatch>) => void;
  onDeleteDraft: (draft: WorkspaceFormDraft<TelegramPostBatch>) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const { locale, t } = useI18n();
  const createdBatches =
    data?.items.filter((batch) => batch.status !== "DRAFT") ?? [];

  return (
    <div className="space-y-4">
      <section
        aria-label={t("telegram.posts.batch.savedDrafts")}
        className="min-w-0 rounded-xl border border-neutral-800 bg-neutral-950/40 p-3"
      >
        <div className="mb-3">
          <div>
            <h4 className="font-medium text-white">
              {t("telegram.posts.batch.savedDrafts")}
            </h4>
            <p className="mt-1 text-xs text-neutral-400">
              {t("telegram.posts.batch.savedDraftsHint")}
            </p>
          </div>
        </div>
        {!drafts.length ? (
          <EmptyState text={t("telegram.posts.batch.noSavedDrafts")} />
        ) : null}
        <div className="space-y-2">
          {drafts.map((draft) => {
            const batch = draft.form;
            return (
              <div
                key={draft.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">
                    {batch.title}
                  </p>
                  <p className="mt-1 text-xs text-neutral-400">
                    {t("telegram.posts.batch.listMeta", {
                      posts: batch.postCount,
                      channels: batch.channelCount,
                    })}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {batchTimestamp(draft.createdAt ?? batch.updatedAt, locale)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <IconButton
                    type="button"
                    kind="delete"
                    aria-label={t("telegram.posts.batch.deleteDraftNamed", {
                      title: batch.title,
                    })}
                    title={t("telegram.posts.batch.deleteDraft")}
                    onClick={() => onDeleteDraft(draft)}
                  />
                  <IconButton
                    type="button"
                    aria-label={t("telegram.posts.batch.editDraftNamed", {
                      title: batch.title,
                    })}
                    title={t("telegram.posts.batch.editDraft")}
                    onClick={() => onContinueDraft(draft)}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <Button
          type="button"
          className="mt-3"
          disabled={!canCreate}
          onClick={onCreate}
        >
          <Plus size={16} />
          {t("telegram.posts.batch.createNew")}
        </Button>
      </section>

      <section
        aria-label={t("telegram.posts.batch.createdBatches")}
        className="min-w-0 rounded-xl border border-neutral-800 bg-neutral-950/40 p-3"
      >
        <h4 className="mb-3 font-medium text-white">
          {t("telegram.posts.batch.createdBatches")}
        </h4>
        {loading ? <LoadingState /> : null}
        {error ? (
          <p role="alert" className="text-sm text-rose-300">
            {t("telegram.posts.batch.listError")}
          </p>
        ) : null}
        {!createdBatches.length ? (
          <EmptyState text={t("telegram.posts.batch.noCreatedBatches")} />
        ) : null}
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {createdBatches.map((batch) => (
            <button
              key={batch.id}
              type="button"
              onClick={() => onOpen(batch)}
              className="w-full rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-left transition hover:border-neutral-700"
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
        {data ? (
          <Pagination
            page={data.pagination.page}
            pageSize={data.pagination.pageSize}
            totalItems={data.pagination.totalItems}
            totalPages={data.pagination.totalPages}
            hasNextPage={data.pagination.page < data.pagination.totalPages}
            hasPreviousPage={data.pagination.page > 1}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
            loading={fetching}
            pageSizeOptions={[10, 25]}
          />
        ) : null}
      </section>
    </div>
  );
}
