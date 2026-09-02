"use client";


import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Copy, FileUp, LoaderCircle } from "lucide-react";
import { Button, Modal } from "@/components/ui/primitives";
import {
  telegramChannelsApi,
  type TelegramManagedPostsImportProgressItem,
  type TelegramManagedPostsImportResult,
} from "@/lib/api";
import { telegramPostKeys } from "@/lib/query-keys";
import { useAppToast } from "@/providers/toast-provider";
import { useI18n } from "@/providers/i18n-provider";
import { safeApiErrorMessage } from "@/i18n/error-localization";
import {
  ManagedPostsGroupConfirmation,
  ManagedPostsGroupSelect,
  ManagedPostsImportSource,
} from "./managed-posts-import-source";
import { ManagedPostsImportWorkspace } from "./managed-posts-import-workspace";
import { buildManagedPostInternalLinks } from "./managed-post-internal-links-notice";
import {
  ChannelImportNavigation,
  type ChannelImportMode,
} from "./channel-import-navigation";
import {
  ManagedPostsImportErrors,
  ManagedPostsImportStats,
} from "./managed-posts-import-summary";
import {
  editableRowsToJsonContent,
  editableRowToImportRow,
  applyGroupToEditableImportRows,
  gptImportPromptFormat,
  isFailedImportStatus,
  isSuccessfulImportStatus,
  normalizeImportRows,
  removeEditableImportRow,
  rowIndicesForTab,
  rowToEditable,
  selectionAfterEditableRowUpdate,
  summarizeImportProgress,
  summarizeResult,
  type EditableImportRow,
  type ImportRowTab,
} from "./managed-posts-import-model";

export {
  editableRowsToJsonContent,
  editableRowToImportRow,
  normalizeImportRows,
  removeEditableImportRow,
  rowToEditable,
} from "./managed-posts-import-model";
const noGroupValue = "__no_group__";
const MAX_MANAGED_POST_IMPORT_BATCH_SIZE = 25;

export function ManagedPostsImportModal({
  open,
  onClose,
  channelId,
  channelTitle,
  channelPhotoUrl,
  channelTelegramChatId,
  captionLengthMax = 1024,
  messageLengthMax = 4096,
  mode,
  onModeChange,
}: {
  open: boolean;
  onClose: () => void;
  channelId: string;
  channelTitle?: string;
  channelPhotoUrl?: string | null;
  channelTelegramChatId?: string | null;
  captionLengthMax?: number;
  messageLengthMax?: number;
  mode: ChannelImportMode;
  onModeChange: (mode: ChannelImportMode) => void;
}) {
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();
  const { pushToast, startOperation } = useAppToast();
  const [postGroupId, setPostGroupId] = useState<string>();
  const [pendingGroupId, setPendingGroupId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [localError, setLocalError] = useState("");
  const [importing, setImporting] = useState(false);
  const [editableRows, setEditableRows] = useState<EditableImportRow[]>([]);
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
  const [result, setResult] = useState<TelegramManagedPostsImportResult | null>(
    null,
  );
  const [progressItems, setProgressItems] = useState<
    TelegramManagedPostsImportProgressItem[]
  >([]);
  const [activeTab, setActiveTab] = useState<ImportRowTab>("new");
  const abortControllerRef = useRef<AbortController | null>(null);

  const postGroups = useQuery({
    queryKey: telegramPostKeys.postGroups(channelId),
    queryFn: () =>
      telegramChannelsApi.postGroupSummaries(channelId),
    enabled: open && Boolean(channelId) && editableRows.length > 0,
  });

  const referencedPostIds = useMemo(
    () => [
      ...new Set(
        editableRows.flatMap((row) =>
          buildManagedPostInternalLinks(row.text).map((link) => link.targetId),
        ),
      ),
    ],
    [editableRows],
  );
  const referencedPosts = useQuery({
    queryKey: ["telegram-managed-post-lookup", channelId, referencedPostIds],
    queryFn: () =>
      telegramChannelsApi.lookupManagedPosts(channelId, referencedPostIds),
    enabled:
      open &&
      Boolean(channelId) &&
      referencedPostIds.length > 0 &&
      referencedPostIds.length <= 1_000,
  });

  const groupOptions = useMemo(
    () => [
      { value: noGroupValue, label: t("telegram.posts.import.noGroup") },
      ...(postGroups.data ?? []).map((group) => {
        const presentation = group.iconPresentation;
        return {
          value: group.id,
          label: group.title,
          iconEmoji:
            presentation?.type === "unicode" ? presentation.value : undefined,
          iconUrl:
            presentation?.type === "image" ? presentation.url : undefined,
          iconFallback: group.title,
        };
      }),
    ],
    [postGroups.data],
  );

  const importRows = useMemo(
    () => editableRows.map(editableRowToImportRow),
    [editableRows],
  );
  const importableRowIndices = useMemo(
    () => editableRows.flatMap((row, index) => (row.imported ? [] : [index])),
    [editableRows],
  );
  const visibleRowIndices = useMemo(
    () => rowIndicesForTab(editableRows, activeTab),
    [activeTab, editableRows],
  );
  const tabCounts = useMemo(
    () => ({
      new: rowIndicesForTab(editableRows, "new").length,
      imported: rowIndicesForTab(editableRows, "imported").length,
    }),
    [editableRows],
  );
  const canImport = Boolean(channelId) && importableRowIndices.length > 0;
  const liveSummary = summarizeImportProgress(progressItems);
  const resultSummary = progressItems.length
    ? {
        created: liveSummary.successful,
        skipped: progressItems.filter((row) => row.status === "skipped").length,
        errors: liveSummary.failed,
      }
    : summarizeResult(result);
  const errorRows = progressItems.filter(
    (row) =>
      isFailedImportStatus(row.status) && Boolean(row.error || row.errorCode),
  );

  const selectTab = (tab: ImportRowTab) => {
    setActiveTab(tab);
    setSelectedRowIndex(rowIndicesForTab(editableRows, tab)[0] ?? 0);
  };

  const updateEditableRow = (
    index: number,
    patch: Partial<EditableImportRow>,
  ) => {
    setResult(null);
    setEditableRows((rows) => {
      const nextRows = rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      );
      setContent(editableRowsToJsonContent(nextRows));
      setFileName(null);
      const nextSelection = selectionAfterEditableRowUpdate(
        nextRows,
        activeTab,
        index,
        patch,
      );
      setActiveTab(nextSelection.tab);
      setSelectedRowIndex(nextSelection.selectedRowIndex);
      return nextRows;
    });
  };

  const deleteEditableRow = (index: number) => {
    const nextRows = removeEditableImportRow(editableRows, index);
    setResult(null);
    setEditableRows(nextRows);
    setContent(editableRowsToJsonContent(nextRows));
    setFileName(null);
    const nextVisibleRows = rowIndicesForTab(nextRows, activeTab);
    setSelectedRowIndex(nextVisibleRows[0] ?? 0);
  };

  const applyImportContent = (
    nextContent: string,
    nextFileName: string | null,
  ) => {
    setPostGroupId(undefined);
    setContent(nextContent);
    setFileName(nextFileName);
    const nextRows = normalizeImportRows(nextContent, nextFileName).map(
      rowToEditable,
    );
    const nextTab: ImportRowTab = rowIndicesForTab(nextRows, "new").length
      ? "new"
      : "imported";
    setEditableRows(nextRows);
    setActiveTab(nextTab);
    setSelectedRowIndex(rowIndicesForTab(nextRows, nextTab)[0] ?? 0);
    setResult(null);
    setProgressItems([]);
  };

  const runImport = async () => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const progressByIndex = new Map<
      number,
      TelegramManagedPostsImportProgressItem
    >();
    const operation = startOperation({
      id: `managed-post-import:${channelId}`,
      title: t("telegram.posts.import.posts"),
      message: t("telegram.posts.import.starting"),
      current: 0,
      total: importableRowIndices.length,
      onCancel: () => controller.abort(),
    });
    setImporting(true);
    setResult(null);
    setProgressItems([]);
    setLocalError("");

    const allRows: TelegramManagedPostsImportResult["rows"] = [];
    try {
      let completed = 0;
      for (
        let offset = 0;
        offset < importableRowIndices.length;
        offset += MAX_MANAGED_POST_IMPORT_BATCH_SIZE
      ) {
        const indexes = importableRowIndices.slice(
          offset,
          offset + MAX_MANAGED_POST_IMPORT_BATCH_SIZE,
        );
        const batchNumber =
          Math.floor(offset / MAX_MANAGED_POST_IMPORT_BATCH_SIZE) + 1;
        const batchResult =
          await telegramChannelsApi.importManagedPostsWithProgress(
            channelId,
            {
              postGroupId:
                !postGroupId || postGroupId === noGroupValue
                  ? null
                  : postGroupId,
              rows: indexes.map((index) => importRows[index]),
            },
            (item, current) => {
              const absoluteIndex = indexes[item.index];
              const progressItem = { ...item, index: absoluteIndex };
              progressByIndex.set(absoluteIndex, progressItem);
              const nextProgress = [...progressByIndex.values()].sort(
                (left, right) => left.index - right.index,
              );
              const summary = summarizeImportProgress(nextProgress);
              setProgressItems(nextProgress);
              if (isSuccessfulImportStatus(item.status)) {
                setEditableRows((rows) => {
                  const nextRows = rows.map((row, index) =>
                    index === absoluteIndex ? { ...row, imported: true } : row,
                  );
                  setContent(editableRowsToJsonContent(nextRows));
                  const nextVisibleRows = rowIndicesForTab(nextRows, activeTab);
                  setSelectedRowIndex((current) =>
                    nextVisibleRows.includes(current)
                      ? current
                      : (nextVisibleRows[0] ?? 0),
                  );
                  return nextRows;
                });
              }
              operation.update({
                message: t("telegram.posts.import.batchMessage", { batch: batchNumber, message: locale === "en" ? item.message : t("telegram.posts.import.importing") }),
                current: completed + current,
                total: importableRowIndices.length,
                progressSummary: summary,
              });
            },
            { signal: controller.signal },
          );
        completed += indexes.length;
        allRows.push(
          ...(batchResult.rows.map((row) => ({
            ...row,
            index: indexes[row.index],
          })) as TelegramManagedPostsImportResult["rows"]),
        );
        setResult({
          createdCount: allRows.filter((row) =>
            isSuccessfulImportStatus(row.status),
          ).length,
          skippedCount: allRows.filter((row) =>
            isFailedImportStatus(row.status),
          ).length,
          rows: allRows,
        });
      }

      const summary = summarizeImportProgress([...progressByIndex.values()]);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: telegramPostKeys.managedLists(channelId),
        }),
        queryClient.invalidateQueries({
          queryKey: telegramPostKeys.managedCalendar(channelId),
        }),
        queryClient.invalidateQueries({
          queryKey: telegramPostKeys.linkTargets(channelId),
        }),
        queryClient.invalidateQueries({
          queryKey: telegramPostKeys.postGroups(channelId),
        }),
      ]);
      const completion = {
        message: t("telegram.posts.import.complete", { successful: summary.successful, failed: summary.failed }),
        details: summary.failed
          ? t("telegram.posts.import.failedRowsHint")
          : undefined,
      };
      if (summary.failed) operation.fail(completion);
      else operation.succeed(completion);
    } catch (error) {
      if (controller.signal.aborted) {
        const summary = summarizeImportProgress([...progressByIndex.values()]);
        const message = t("telegram.posts.import.stopped", { successful: summary.successful, failed: summary.failed });
        setLocalError(message);
        operation.dismiss();
        pushToast(message, "info", 8000);
      } else {
        const message = safeApiErrorMessage(error, locale, t, t("telegram.posts.import.postsError"));
        setLocalError(message);
        operation.fail({ message });
      }
    } finally {
      abortControllerRef.current = null;
      setImporting(false);
    }
  };
  const handleFile = async (file?: File | null) => {
    if (!file) return;
    setLocalError("");
    applyImportContent(await file.text(), file.name);
  };

  const close = () => {
    if (importing) {
      abortControllerRef.current?.abort();
      return;
    }
    setLocalError("");
    setResult(null);
    setProgressItems([]);
    onClose();
  };

  const submit = () => {
    setLocalError("");
    setResult(null);
    if (!importRows.length) {
      setLocalError(
        t("telegram.posts.import.dataRequired"),
      );
      return;
    }
    void runImport();
  };

  const copyPromptFormat = async () => {
    try {
      await navigator.clipboard.writeText(gptImportPromptFormat);
      pushToast(t("telegram.posts.import.promptCopied"), "success");
    } catch {
      pushToast(t("telegram.posts.import.promptCopyError"), "error");
    }
  };

  const copyImportContent = async () => {
    try {
      await navigator.clipboard.writeText(content);
      pushToast(t("telegram.posts.import.dataCopied"), "success");
    } catch {
      pushToast(t("telegram.posts.import.dataCopyError"), "error");
    }
  };

  const confirmGroupChange = () => {
    if (!pendingGroupId) return;
    const nextGroupId = pendingGroupId === noGroupValue ? null : pendingGroupId;
    const nextRows = applyGroupToEditableImportRows(editableRows, nextGroupId);
    setPostGroupId(pendingGroupId);
    setEditableRows(nextRows);
    setContent(editableRowsToJsonContent(nextRows));
    setFileName(null);
    setResult(null);
    setPendingGroupId(null);
  };

  return (
    <Modal open={open} onClose={close} title={t("telegram.posts.support.channelImport")} size="xl">
      <div className="mb-4">
        <ChannelImportNavigation
          value={mode}
          onChange={onModeChange}
          disabled={importing}
        />
      </div>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">{t("telegram.posts.import.posts")}</h3>
            <p className="mt-0.5 text-xs text-neutral-400">
              {t("telegram.posts.import.importHint")}
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={importing}
            onClick={() => void copyPromptFormat()}
            title={t("telegram.posts.import.copyPrompt")}
            aria-label={t("telegram.posts.import.copyPrompt")}
          >
            <ClipboardList size={15} />
            <span>{t("telegram.posts.import.prompt")}</span>
            <Copy size={13} />
          </Button>
        </div>
        <ManagedPostsImportSource
          content={content}
          fileName={fileName}
          disabled={importing}
          onContent={(nextContent) => applyImportContent(nextContent, null)}
          onFile={(file) => void handleFile(file)}
          onClear={() => applyImportContent("", null)}
          onCopyContent={() => void copyImportContent()}
        />

        {editableRows.length ? (
          <ManagedPostsGroupSelect
            value={postGroupId}
            options={groupOptions}
            loading={postGroups.isLoading}
            disabled={importing}
            error={Boolean(postGroups.error)}
            onChange={setPendingGroupId}
          />
        ) : null}

        {editableRows.length ? (
          <>
            <p className="text-xs text-neutral-500">
              {t("telegram.posts.import.batchHint", { count: MAX_MANAGED_POST_IMPORT_BATCH_SIZE })}
            </p>
            <ManagedPostsImportStats
              parsed={editableRows.length}
              successful={resultSummary.created}
              skipped={resultSummary.skipped}
              errors={resultSummary.errors}
            />
          </>
        ) : null}

        {editableRows.length ? (
          <ManagedPostsImportWorkspace
            rows={editableRows}
            visibleRowIndices={visibleRowIndices}
            selectedRowIndex={selectedRowIndex}
            activeTab={activeTab}
            tabCounts={tabCounts}
            disabled={importing}
            channelId={channelId}
            channelTitle={channelTitle}
            channelPhotoUrl={channelPhotoUrl}
            channelTelegramChatId={channelTelegramChatId}
            captionLengthMax={captionLengthMax}
            messageLengthMax={messageLengthMax}
            referencedPosts={referencedPosts.data?.items ?? []}
            groupOptions={groupOptions}
            onUpdateRow={updateEditableRow}
            onDeleteRow={deleteEditableRow}
            onSelectRow={setSelectedRowIndex}
            onSelectTab={selectTab}
          />
        ) : null}
        <ManagedPostsImportErrors rows={errorRows} />

        {localError ? (
          <p className="rounded-lg border border-rose-800/70 bg-rose-950/25 p-3 text-sm text-rose-200">
            {localError}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {editableRows.length ? (
            <Button
              type="button"
              variant="secondary"
              onClick={close}
              disabled={importing}
            >
              {t("common.close")}
            </Button>
          ) : null}
          <Button
            type="button"
            onClick={submit}
            disabled={!canImport || importing}
            title={
              !importableRowIndices.length
                ? t("telegram.posts.import.allImported")
                : undefined
            }
          >
            <span className="inline-flex items-center gap-2">
              {importing ? (
                <LoaderCircle size={15} className="animate-spin" />
              ) : (
                <FileUp size={15} />
              )}
              {importing
                ? t("telegram.posts.import.importing")
                : !importableRowIndices.length
                  ? t("telegram.posts.import.allImported")
                  : t("telegram.posts.import.importButton")}
            </span>
          </Button>
        </div>
      </div>
      <ManagedPostsGroupConfirmation
        option={
          groupOptions.find((option) => option.value === pendingGroupId) ?? null
        }
        rowCount={editableRows.length}
        onClose={() => setPendingGroupId(null)}
        onConfirm={confirmGroupChange}
      />
    </Modal>
  );
}
