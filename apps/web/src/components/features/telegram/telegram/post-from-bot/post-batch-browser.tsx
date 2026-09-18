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
  LoadingState,
} from "@/components/ui/primitives";
import { Pagination } from "@/components/ui/pagination";
import { ModalDraftPicker } from "@/components/ui/modal-draft-picker";
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
      {drafts.length ? (
        <section aria-label={t("telegram.posts.batch.savedDrafts")}>
          <ModalDraftPicker
            drafts={drafts}
            titleFor={(batch) => batch.title || "Untitled post batch"}
            onContinue={onContinueDraft}
            onDelete={onDeleteDraft}
            onCreateNew={onCreate}
            createDisabled={!canCreate}
          />
        </section>
      ) : (
        <section
          aria-label={t("telegram.posts.batch.savedDrafts")}
          className="min-w-0 rounded-xl border border-neutral-800 bg-neutral-950/40 p-3"
        >
          <h4 className="font-medium text-white">
            {t("telegram.posts.batch.savedDrafts")}
          </h4>
          <p className="mb-3 mt-1 text-xs text-neutral-400">
            {t("telegram.posts.batch.savedDraftsHint")}
          </p>
          <EmptyState text={t("telegram.posts.batch.noSavedDrafts")} />
          <Button type="button" className="mt-3" disabled={!canCreate} onClick={onCreate}>
            <Plus size={16} /> {t("telegram.posts.batch.createNew")}
          </Button>
        </section>
      )}

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
