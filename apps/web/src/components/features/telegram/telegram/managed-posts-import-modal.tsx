"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  FileUp,
  ListChecks,
  LoaderCircle,
  Trash2,
} from "lucide-react";
import { IconPicker } from "@/components/icons/icon-picker";
import {
  buildManagedPostInternalLinks,
  ManagedPostInternalLinksNotice,
} from "@/components/features/telegram/telegram/managed-post-internal-links-notice";
import {
  TelegramTextEditor,
  type TelegramTextEditorHandle,
} from "@/components/features/telegram/telegram/telegram-text-editor";
import { TelegramPostPreview } from "@/components/features/telegram/telegram/telegram-post-preview";
import {
  Button,
  CustomSelect,
  FormField,
  Input,
  DateInput,
  Modal,
  TimeInput,
  Textarea,
} from "@/components/ui/primitives";
import {
  telegramChannelsApi,
  type TelegramManagedPostsImportProgressItem,
  type TelegramManagedPostsImportResult,
} from "@/lib/api";
import { telegramPostKeys } from "@/lib/query-keys";
import { buildTelegramPostsUrl } from "@/lib/features/telegram/telegram-posts-url";
import { useAppToast } from "@/providers/toast-provider";
import { ManagedPostsImportList } from "./managed-posts-import-list";
import {
  ManagedPostsImportErrors,
  ManagedPostsImportStats,
} from "./managed-posts-import-summary";
import {
  editableRowsToJsonContent,
  editableRowToImportRow,
  gptImportPromptFormat,
  importImageSearchToArray,
  importIconPresentation,
  isFailedImportStatus,
  isSuccessfulImportStatus,
  normalizeImportRows,
  removeEditableImportRow,
  rowIndicesForTab,
  rowToEditable,
  summarizeImportProgress,
  summarizeResult,
  urlsTextToArray,
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
const useDefaultGroupValue = "__use_default_group__";
const MAX_MANAGED_POST_IMPORT_BATCH_SIZE = 25;

function apiErrorMessage(error: unknown, fallback: string) {
  const apiError = error as {
    response?: { data?: { message?: string | string[] } };
    message?: string;
  };
  const message = apiError.response?.data?.message;
  return Array.isArray(message)
    ? message.join(", ")
    : message || apiError.message || fallback;
}

export function ManagedPostsImportModal({
  open,
  onClose,
  channelId,
  channelTitle,
  channelPhotoUrl,
  channelTelegramChatId,
  captionLengthMax = 1024,
  messageLengthMax = 4096,
}: {
  open: boolean;
  onClose: () => void;
  channelId: string;
  channelTitle?: string;
  channelPhotoUrl?: string | null;
  channelTelegramChatId?: string | null;
  captionLengthMax?: number;
  messageLengthMax?: number;
}) {
  const queryClient = useQueryClient();
  const { pushToast, startOperation } = useAppToast();
  const textEditorRef = useRef<TelegramTextEditorHandle | null>(null);
  const [postGroupId, setPostGroupId] = useState(noGroupValue);
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [localError, setLocalError] = useState("");
  const [importing, setImporting] = useState(false);
  const [editableRows, setEditableRows] = useState<EditableImportRow[]>([]);
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
  const [highlightedInternalLinkTargetId, setHighlightedInternalLinkTargetId] =
    useState<string | null>(null);
  const [highlightRequestKey, setHighlightRequestKey] = useState(0);
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
      telegramChannelsApi.postGroups({ telegramChannelId: channelId }),
    enabled: open && Boolean(channelId),
  });

  const managedPosts = useQuery({
    queryKey: telegramPostKeys.managed(channelId),
    queryFn: () => telegramChannelsApi.managedPosts(channelId),
    enabled: open && Boolean(channelId),
  });

  const groupOptions = useMemo(
    () => [
      { value: noGroupValue, label: "No group" },
      ...(postGroups.data ?? []).map((group) => {
        const presentation = group.iconPresentation;
        return {
          value: group.id,
          label: group.title,
          iconEmoji:
            presentation?.type === "unicode"
              ? presentation.value
              : undefined,
          iconUrl:
            presentation?.type === "image"
              ? presentation.url
              : undefined,
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
  const selectedRow = visibleRowIndices.includes(selectedRowIndex)
    ? editableRows[selectedRowIndex]
    : null;
  const selectedIconPresentation = importIconPresentation(
    selectedRow?.icon ?? "",
  );
  const selectedIconId =
    selectedRow?.icon && !selectedIconPresentation ? selectedRow.icon : null;
  const selectedImageUrls = useMemo(
    () => (selectedRow ? urlsTextToArray(selectedRow.urlsText) : []),
    [selectedRow],
  );
  const selectedImageSearchQueries = useMemo(
    () =>
      selectedRow
        ? importImageSearchToArray(selectedRow.imageSearchText)
        : [],
    [selectedRow],
  );
  const selectedOutgoingInternalLinks = useMemo(
    () =>
      selectedRow
        ? buildManagedPostInternalLinks(selectedRow.text, managedPosts.data)
        : [],
    [managedPosts.data, selectedRow],
  );
  const tabCounts = useMemo(
    () => ({
      new: rowIndicesForTab(editableRows, "new").length,
      approved: rowIndicesForTab(editableRows, "approved").length,
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
    (row): row is typeof row & { error: string } =>
      isFailedImportStatus(row.status) && Boolean(row.error),
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
      const nextVisibleRows = rowIndicesForTab(nextRows, activeTab);
      if (!nextVisibleRows.includes(index)) {
        setSelectedRowIndex(nextVisibleRows[0] ?? 0);
      }
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
    setContent(nextContent);
    setFileName(nextFileName);
    const nextRows = normalizeImportRows(nextContent, nextFileName).map(rowToEditable);
    const nextTab: ImportRowTab = rowIndicesForTab(nextRows, "new").length
      ? "new"
      : rowIndicesForTab(nextRows, "approved").length
        ? "approved"
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
      title: "Import posts",
      message: "Starting import...",
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
                postGroupId === noGroupValue ? null : postGroupId,
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
                  setSelectedRowIndex((current) => nextVisibleRows.includes(current)
                    ? current : (nextVisibleRows[0] ?? 0));
                  return nextRows;
                });
              }
              operation.update({
                message: `Batch ${batchNumber}: ${item.message}`,
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
          queryKey: telegramPostKeys.managed(channelId),
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
        message: `Import finished: ${summary.successful} successful, ${summary.failed} failed.`,
        details: summary.failed
          ? "Failed rows stay outside Imported and can be retried."
          : undefined,
      };
      if (summary.failed) operation.fail(completion);
      else operation.succeed(completion);
    } catch (error) {
      if (controller.signal.aborted) {
        const summary = summarizeImportProgress([...progressByIndex.values()]);
        const message = `Import stopped. ${summary.successful} successful, ${summary.failed} failed before cancellation.`;
        setLocalError(message);
        operation.dismiss();
        pushToast(message, "info", 8000);
      } else {
        const message = apiErrorMessage(error, "Could not import managed posts");
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
      setLocalError("Paste rows or upload a JSON, CSV, TSV, or TXT file first.");
      return;
    }
    void runImport();
  };

  const copyImageSearchQuery = async (query: string) => {
    try {
      await navigator.clipboard.writeText(query);
      pushToast("Image search query copied.", "success");
    } catch {
      pushToast("Could not copy image search query.", "error");
    }
  };

  const copyPromptFormat = async () => {
    try {
      await navigator.clipboard.writeText(gptImportPromptFormat);
      pushToast("GPT prompt format copied.", "success");
    } catch {
      pushToast("Could not copy GPT prompt format.", "error");
    }
  };

  const highlightInternalLinkTarget = (targetId: string) => {
    setHighlightedInternalLinkTargetId(targetId);
    setHighlightRequestKey((current) => current + 1);
  };

  return (
    <Modal open={open} onClose={close} title="Import managed posts" size="xl">
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => {
            void copyPromptFormat();
          }}
          className="group flex w-full items-center justify-between gap-3 rounded-lg border border-blue-800/60 bg-blue-950/20 p-2.5 text-left text-blue-100 transition hover:border-blue-600 hover:bg-blue-950/35"
          title="Copy GPT prompt format"
        >
          <div className="inline-flex min-w-0 items-center gap-2 text-sm font-medium">
            <ClipboardList size={15} className="shrink-0" />
            <span className="truncate">GPT prompt format</span>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-blue-800/60 bg-neutral-950/70 px-2 py-1 text-[11px] text-blue-100/80 group-hover:text-white">
            <Copy size={12} />
            Copy
          </span>
        </button>

        <FormField label="Post group">
          <CustomSelect
            value={postGroupId}
            onChange={setPostGroupId}
            options={groupOptions}
            disabled={postGroups.isLoading || importing}
            placeholder={
              postGroups.isLoading ? "Loading groups..." : "Select group"
            }
          />
          {postGroups.error ? (
            <p className="mt-1 text-xs text-amber-300">
              Could not load post groups. Import can still create ungrouped
              posts.
            </p>
          ) : null}
        </FormField>

        <FormField label="Upload file">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-700 bg-neutral-950 px-3 py-4 text-sm text-neutral-300 hover:border-blue-600 hover:text-white">
            <FileUp size={18} />
            <span className="truncate">
              {fileName ? fileName : "Choose JSON, CSV, TSV, or TXT"}
            </span>
            <input
              type="file"
              accept=".json,.csv,.tsv,.txt,application/json,text/csv,text/tab-separated-values,text/plain"
              className="sr-only"
              disabled={importing}
              onChange={(event) => {
                void handleFile(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </FormField>

        <FormField label="Paste import data">
          <Textarea
            value={content}
            onChange={(event) => {
              applyImportContent(event.target.value, null);
            }}
            rows={10}
            disabled={importing}
            placeholder="Paste JSON, CSV, TSV, or plain text posts here."
            className="font-mono text-xs"
          />
        </FormField>
        <p className="text-xs text-neutral-500">Up to {MAX_MANAGED_POST_IMPORT_BATCH_SIZE} posts are processed per request. Larger imports are processed sequentially in batches.</p>

        <ManagedPostsImportStats
          parsed={editableRows.length}
          successful={resultSummary.created}
          skipped={resultSummary.skipped}
          errors={resultSummary.errors}
        />

        {editableRows.length ? (
          <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-100">
                <ListChecks size={16} />
                Preview & edit
                <span className="text-xs font-normal text-neutral-500">
                  {selectedRowIndex + 1} of {editableRows.length}
                </span>
              </div>
              <div className="inline-flex items-center gap-2">
                <Button
                  type="button"
                  variant="danger"
                  className="px-2 py-2"
                  disabled={importing}
                  onClick={() => deleteEditableRow(selectedRowIndex)}
                  title="Delete post from import"
                  aria-label="Delete post from import"
                >
                  <Trash2 size={14} />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="px-2 py-2"
                  disabled={visibleRowIndices.indexOf(selectedRowIndex) <= 0 || importing}
                  onClick={() => {
                    const position = visibleRowIndices.indexOf(selectedRowIndex);
                    setSelectedRowIndex(visibleRowIndices[position - 1]);
                  }}
                >
                  <ChevronLeft size={14} />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="px-2 py-2"
                  disabled={
                    visibleRowIndices.indexOf(selectedRowIndex) >=
                      visibleRowIndices.length - 1 || importing
                  }
                  onClick={() => {
                    const position = visibleRowIndices.indexOf(selectedRowIndex);
                    setSelectedRowIndex(visibleRowIndices[position + 1]);
                  }}
                >
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
            <div className="grid gap-3 xl:grid-cols-[minmax(270px,0.72fr)_minmax(420px,1.25fr)_minmax(260px,0.7fr)]">
              <div className="min-h-[360px] overflow-hidden rounded-lg border border-neutral-800 bg-[#0e1b26]">
                <TelegramPostPreview
                  channelTitle={channelTitle || "Preview"}
                  channelPhotoUrl={channelPhotoUrl ?? null}
                  text={selectedRow?.text ?? ""}
                  imageUrls={selectedImageUrls}
                  onTextChange={(nextText) => {
                    if (textEditorRef.current) {
                      textEditorRef.current.commitExternalChange(nextText);
                      return;
                    }
                    updateEditableRow(selectedRowIndex, { text: nextText });
                  }}
                  onUndo={() => textEditorRef.current?.undo()}
                  onRedo={() => textEditorRef.current?.redo()}
                  captionLengthMax={captionLengthMax}
                  messageLengthMax={messageLengthMax}
                />
              </div>

              {selectedRow ? (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-[96px_minmax(0,1fr)]">
                    <FormField label="Icon">
                      <IconPicker
                        compact
                        allowImages={false}
                        disabled={importing}
                        iconId={selectedIconId}
                        icon={selectedIconPresentation}
                        onChange={(iconId) =>
                          updateEditableRow(selectedRowIndex, {
                            icon: iconId ?? "",
                          })
                        }
                        onEmojiChange={(emoji) =>
                          updateEditableRow(selectedRowIndex, {
                            icon: emoji ?? "",
                          })
                        }
                        buttonLabel="Add emoji"
                        className="!h-9 !w-9"
                        iconClassName="!h-6 !w-6 !bg-transparent"
                      />
                    </FormField>
                    <FormField label="Title">
                      <Input
                        value={selectedRow.title}
                        disabled={importing}
                        onChange={(event) =>
                          updateEditableRow(selectedRowIndex, {
                            title: event.target.value,
                          })
                        }
                      />
                    </FormField>
                  </div>
                  <FormField label="Telegram text">
                    <TelegramTextEditor
                      key={selectedRowIndex}
                      ref={textEditorRef}
                      rows={9}
                      value={selectedRow.text}
                      disabled={importing}
                      channelId={channelId}
                      enableInternalPostLinks
                      internalLinkUsage="edit"
                      highlightInternalLinkTargetId={
                        highlightedInternalLinkTargetId
                      }
                      highlightRequestKey={highlightRequestKey}
                      availableInternalPosts={managedPosts.data || []}
                      onChange={(nextText) =>
                        updateEditableRow(selectedRowIndex, {
                          text: nextText,
                        })
                      }
                    />
                  </FormField>
                  <ManagedPostInternalLinksNotice
                    links={selectedOutgoingInternalLinks}
                    channelTelegramChatId={channelTelegramChatId}
                    onHighlightTarget={highlightInternalLinkTarget}
                    onOpenPostInNewTab={(post) => {
                      window.open(
                        buildTelegramPostsUrl({
                          channelId,
                          postId: post.id,
                          postView: "editor",
                        }),
                        "_blank",
                        "noopener,noreferrer",
                      );
                    }}
                  />
                  <FormField label="Image URLs">
                      <Textarea
                        rows={4}
                        value={selectedRow.urlsText}
                        disabled={importing}
                        placeholder="One image URL per line"
                        className="font-mono text-xs"
                        onChange={(event) =>
                          updateEditableRow(selectedRowIndex, {
                            urlsText: event.target.value,
                          })
                        }
                      />
                  </FormField>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex items-center gap-2 text-sm text-neutral-200"><input type="checkbox" checked={selectedRow.approved} disabled={importing} onChange={(event) => updateEditableRow(selectedRowIndex, { approved: event.target.checked })} /> Approved</label>
                    <label className="flex items-center gap-2 text-sm text-neutral-200"><input type="checkbox" checked={selectedRow.imported} disabled={importing} onChange={(event) => updateEditableRow(selectedRowIndex, { imported: event.target.checked })} /> Imported</label>
                    <FormField label="Post group"><CustomSelect value={selectedRow.groupId === undefined ? useDefaultGroupValue : selectedRow.groupId ?? noGroupValue} onChange={(value) => updateEditableRow(selectedRowIndex, { groupId: value === useDefaultGroupValue ? undefined : value === noGroupValue ? null : value })} disabled={importing} options={[{ value: useDefaultGroupValue, label: "Use default group" }, ...groupOptions]} /></FormField>
                    <div className="grid grid-cols-2 gap-2"><FormField label="Date"><DateInput value={selectedRow.scheduledAt?.slice(0, 10) ?? ""} disabled={importing} onChange={(event) => { const time = selectedRow.scheduledAt?.slice(11, 16) ?? "09:00"; updateEditableRow(selectedRowIndex, { scheduledAt: event.target.value ? new Date(`${event.target.value}T${time}:00`).toISOString() : null }); }} /></FormField><FormField label="Time"><TimeInput value={selectedRow.scheduledAt?.slice(11, 16) ?? ""} disabled={importing} onChange={(event) => { const date = selectedRow.scheduledAt?.slice(0, 10); if (date) updateEditableRow(selectedRowIndex, { scheduledAt: new Date(`${date}T${event.target.value}:00`).toISOString() }); }} /></FormField><Button type="button" variant="secondary" className="col-span-2" disabled={importing || !selectedRow.scheduledAt} onClick={() => updateEditableRow(selectedRowIndex, { scheduledAt: null })}>Clear schedule</Button></div>
                  </div>
                  <FormField label="Image search">
                    <Textarea
                      rows={3}
                      value={selectedRow.imageSearchText}
                      disabled={importing}
                      placeholder="One search query per line"
                      className="font-mono text-xs"
                      onChange={(event) =>
                        updateEditableRow(selectedRowIndex, {
                          imageSearchText: event.target.value,
                        })
                      }
                    />
                    {selectedImageSearchQueries.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {selectedImageSearchQueries.map((query, index) => (
                          <button
                            key={`${query}-${index}`}
                            type="button"
                            disabled={importing}
                            onClick={() => {
                              void copyImageSearchQuery(query);
                            }}
                            className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-left text-xs text-neutral-200 transition hover:border-blue-600 hover:bg-blue-950/30 disabled:cursor-not-allowed disabled:opacity-60"
                            title="Copy image search query"
                          >
                            <span className="min-w-0 truncate">{query}</span>
                            <Copy
                              size={12}
                              className="shrink-0 text-neutral-400"
                            />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-neutral-500">
                        Import-only hints for finding replacement images.
                      </p>
                    )}
                  </FormField>
                </div>
              ) : null}

              <ManagedPostsImportList
                rows={editableRows}
                visibleRowIndices={visibleRowIndices}
                selectedRowIndex={selectedRowIndex}
                activeTab={activeTab}
                tabCounts={tabCounts}
                disabled={importing}
                onSelectRow={setSelectedRowIndex}
                onSelectTab={selectTab}
              />
            </div>
          </div>
        ) : null}

        <ManagedPostsImportErrors rows={errorRows} />

        {localError ? (
          <p className="rounded-lg border border-rose-800/70 bg-rose-950/25 p-3 text-sm text-rose-200">
            {localError}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={close}
            disabled={importing}
          >
            Close
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={!canImport || importing}
            title={!importableRowIndices.length ? "All posts are already marked as imported." : undefined}
          >
            <span className="inline-flex items-center gap-2">
              {importing ? (
                <LoaderCircle size={15} className="animate-spin" />
              ) : (
                <FileUp size={15} />
              )}
              {importing ? "Importing..." : !importableRowIndices.length ? "All posts are already marked as imported" : "Import posts"}
            </span>
          </Button>
        </div>
      </div>
    </Modal>
  );
}
