"use client";

import { type ReactNode, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ListChecks, Trash2 } from "lucide-react";
import { IconPicker } from "@/components/icons/icon-picker";
import {
  buildManagedPostInternalLinks,
  ManagedPostInternalLinksNotice,
} from "./managed-post-internal-links-notice";
import {
  TelegramTextEditor,
  type TelegramTextEditorHandle,
} from "./telegram-text-editor";
import { TelegramPostPreview } from "./telegram-post-preview";
import {
  Button,
  CustomSelect,
  DateInput,
  FormField,
  Input,
  MultiSelect,
  Textarea,
  TimeInput,
} from "@/components/ui/primitives";
import type { TelegramManagedPostLookupItem } from "@/lib/features/telegram/telegram-managed-posts-api";
import { buildTelegramPostsUrl } from "@/lib/features/telegram/telegram-posts-url";
import { ManagedPostsImportList } from "./managed-posts-import-list";
import {
  importIconPresentation,
  urlsTextToArray,
  type EditableImportRow,
  type ImportRowTab,
} from "./managed-posts-import-model";
import type { ManagedPostsGroupOption } from "./managed-posts-import-source";
import { useI18n } from "@/providers/i18n-provider";
import { PublicationSlotOptions } from "./publication-slot-occurrence-select";

const noGroupValue = "__no_group__";
const useDefaultGroupValue = "__use_default_group__";
const localDateKey = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;

export function ManagedPostsImportWorkspace({
  rows,
  visibleRowIndices,
  selectedRowIndex,
  activeTab,
  tabCounts,
  disabled,
  channelId,
  channelTitle,
  channelPhotoUrl,
  channelTelegramChatId,
  captionLengthMax,
  messageLengthMax,
  referencedPosts,
  groupOptions,
  hypothesisOptions = [],
  selectedRowAdornment,
  selectedRowDetails,
  scheduleValue,
  onUpdateRow,
  onDeleteRow,
  onSelectRow,
  onSelectTab,
  onUpdateHypotheses,
  onScheduleChange,
}: {
  rows: EditableImportRow[];
  visibleRowIndices: number[];
  selectedRowIndex: number;
  activeTab: ImportRowTab;
  tabCounts: Record<ImportRowTab, number>;
  disabled: boolean;
  channelId: string;
  channelTitle?: string;
  channelPhotoUrl?: string | null;
  channelTelegramChatId?: string | null;
  captionLengthMax: number;
  messageLengthMax: number;
  referencedPosts: TelegramManagedPostLookupItem[];
  groupOptions: ManagedPostsGroupOption[];
  hypothesisOptions?: Array<{
    value: string;
    label: string;
    iconEmoji?: string;
  }>;
  selectedRowAdornment?: ReactNode;
  selectedRowDetails?: ReactNode;
  scheduleValue?: {
    slotId?: string | null;
    scheduledAt?: string | null;
  } | null;
  onUpdateRow: (index: number, patch: Partial<EditableImportRow>) => void;
  onDeleteRow: (index: number) => void;
  onSelectRow: (index: number) => void;
  onSelectTab: (tab: ImportRowTab) => void;
  onUpdateHypotheses?: (index: number, refs: string[]) => void;
  onScheduleChange?: (
    index: number,
    value: { slotId: string | null; scheduledAt: string | null },
  ) => void;
}) {
  const { t } = useI18n();
  const textEditorRef = useRef<TelegramTextEditorHandle | null>(null);
  const [highlightedTargetId, setHighlightedTargetId] = useState<string | null>(
    null,
  );
  const [highlightRequestKey, setHighlightRequestKey] = useState(0);
  const selectedRow = visibleRowIndices.includes(selectedRowIndex)
    ? rows[selectedRowIndex]
    : null;
  const imageUrls = useMemo(
    () => (selectedRow ? urlsTextToArray(selectedRow.urlsText) : []),
    [selectedRow],
  );
  const outgoingLinks = useMemo(
    () =>
      selectedRow
        ? buildManagedPostInternalLinks(selectedRow.text, referencedPosts)
        : [],
    [referencedPosts, selectedRow],
  );
  const iconPresentation = importIconPresentation(selectedRow?.icon ?? "");
  const iconId =
    selectedRow?.icon && !iconPresentation ? selectedRow.icon : null;
  const selectedPosition = visibleRowIndices.indexOf(selectedRowIndex);
  const updateScheduledAt = (
    scheduledAt: string | null,
    slotId = scheduleValue?.slotId ?? null,
  ) => {
    if (onScheduleChange) {
      onScheduleChange(selectedRowIndex, { slotId, scheduledAt });
      return;
    }
    onUpdateRow(selectedRowIndex, { scheduledAt });
  };

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-100">
          <ListChecks size={16} />
          {t("telegram.posts.import.preview")}
          {selectedRowAdornment}
          <span className="text-xs font-normal text-neutral-500">
            {t("telegram.posts.import.position", {
              current: selectedRowIndex + 1,
              total: rows.length,
            })}
          </span>
        </div>
        <div className="inline-flex items-center gap-2">
          <Button
            type="button"
            variant="danger"
            className="px-2 py-2"
            disabled={disabled}
            onClick={() => onDeleteRow(selectedRowIndex)}
            title={t("telegram.posts.import.deletePost")}
            aria-label={t("telegram.posts.import.deletePost")}
          >
            <Trash2 size={14} />
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="px-2 py-2"
            disabled={selectedPosition <= 0 || disabled}
            onClick={() => onSelectRow(visibleRowIndices[selectedPosition - 1])}
            aria-label={t("telegram.posts.import.previousPost")}
          >
            <ChevronLeft size={14} />
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="px-2 py-2"
            disabled={
              selectedPosition >= visibleRowIndices.length - 1 || disabled
            }
            onClick={() => onSelectRow(visibleRowIndices[selectedPosition + 1])}
            aria-label={t("telegram.posts.import.nextPost")}
          >
            <ChevronRight size={14} />
          </Button>
        </div>
      </div>

      {selectedRowDetails}

      <div className="grid gap-3 xl:grid-cols-[minmax(270px,0.72fr)_minmax(420px,1.25fr)_minmax(260px,0.7fr)]">
        <div className="min-h-[360px] overflow-hidden rounded-lg border border-neutral-800 bg-[#0e1b26]">
          <TelegramPostPreview
            channelTitle={
              channelTitle || t("telegram.posts.import.previewChannel")
            }
            channelPhotoUrl={channelPhotoUrl ?? null}
            text={selectedRow?.text ?? ""}
            imageUrls={imageUrls}
            onTextChange={(text) => {
              if (textEditorRef.current) {
                textEditorRef.current.commitExternalChange(text);
              } else {
                onUpdateRow(selectedRowIndex, { text });
              }
            }}
            onUndo={() => textEditorRef.current?.undo()}
            onRedo={() => textEditorRef.current?.redo()}
            captionLengthMax={captionLengthMax}
            messageLengthMax={messageLengthMax}
          />
        </div>

        {selectedRow ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <label className="flex items-center gap-2 text-sm text-neutral-200">
                <input
                  type="checkbox"
                  checked={selectedRow.approved}
                  disabled={disabled}
                  onChange={(event) =>
                    onUpdateRow(selectedRowIndex, {
                      approved: event.target.checked,
                    })
                  }
                />
                {t("telegram.posts.import.approved")}
              </label>
              <label className="flex items-center gap-2 text-sm text-neutral-200">
                <input
                  type="checkbox"
                  checked={selectedRow.imported}
                  disabled={disabled}
                  onChange={(event) =>
                    onUpdateRow(selectedRowIndex, {
                      imported: event.target.checked,
                    })
                  }
                />
                {t("telegram.posts.import.imported")}
              </label>
            </div>

            <div
              data-testid="managed-post-import-identity-fields"
              className="grid gap-2 sm:grid-cols-[36px_minmax(0,1fr)]"
            >
              <FormField label={t("telegram.posts.import.icon")}>
                <IconPicker
                  compact
                  allowImages={false}
                  disabled={disabled}
                  iconId={iconId}
                  icon={iconPresentation}
                  onChange={(icon) =>
                    onUpdateRow(selectedRowIndex, { icon: icon ?? "" })
                  }
                  onEmojiChange={(icon) =>
                    onUpdateRow(selectedRowIndex, { icon: icon ?? "" })
                  }
                  buttonLabel={t("telegram.posts.icon.addEmoji")}
                  className="!h-9 !w-9"
                  iconClassName="!h-6 !w-6 !bg-transparent"
                />
              </FormField>
              <FormField label={t("telegram.posts.import.titleField")}>
                <Input
                  value={selectedRow.title}
                  disabled={disabled}
                  onChange={(event) =>
                    onUpdateRow(selectedRowIndex, { title: event.target.value })
                  }
                />
              </FormField>
            </div>

            <FormField label={t("telegram.posts.import.telegramText")}>
              <TelegramTextEditor
                key={selectedRowIndex}
                ref={textEditorRef}
                rows={9}
                value={selectedRow.text}
                disabled={disabled}
                channelId={channelId}
                enableInternalPostLinks
                internalLinkUsage="edit"
                highlightInternalLinkTargetId={highlightedTargetId}
                highlightRequestKey={highlightRequestKey}
                onChange={(text) => onUpdateRow(selectedRowIndex, { text })}
              />
            </FormField>
            <ManagedPostInternalLinksNotice
              links={outgoingLinks}
              channelTelegramChatId={channelTelegramChatId}
              onHighlightTarget={(targetId) => {
                setHighlightedTargetId(targetId);
                setHighlightRequestKey((current) => current + 1);
              }}
              onOpenPostInNewTab={(post) =>
                window.open(
                  buildTelegramPostsUrl({
                    channelId,
                    postId: post.id,
                    postView: "editor",
                  }),
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            />

            <div className="grid gap-3 lg:grid-cols-2">
              <FormField label={t("telegram.posts.import.imageUrls")}>
                <Textarea
                  rows={3}
                  value={selectedRow.urlsText}
                  disabled={disabled}
                  placeholder={t("telegram.posts.import.imageUrlsHint")}
                  className="font-mono text-xs"
                  onChange={(event) =>
                    onUpdateRow(selectedRowIndex, {
                      urlsText: event.target.value,
                    })
                  }
                />
              </FormField>
              <FormField label={t("telegram.posts.import.imageSearch")}>
                <Textarea
                  rows={3}
                  value={selectedRow.imageSearchText}
                  disabled={disabled}
                  placeholder={t("telegram.posts.import.imageSearchHint")}
                  className="font-mono text-xs"
                  onChange={(event) =>
                    onUpdateRow(selectedRowIndex, {
                      imageSearchText: event.target.value,
                    })
                  }
                />
              </FormField>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <FormField label={t("telegram.posts.import.postGroup")}>
                <CustomSelect
                  value={
                    selectedRow.groupId === undefined
                      ? useDefaultGroupValue
                      : (selectedRow.groupId ?? noGroupValue)
                  }
                  onChange={(value) =>
                    onUpdateRow(selectedRowIndex, {
                      groupId:
                        value === useDefaultGroupValue
                          ? undefined
                          : value === noGroupValue
                            ? null
                            : value,
                    })
                  }
                  disabled={disabled}
                  options={[
                    {
                      value: useDefaultGroupValue,
                      label: t("telegram.posts.import.defaultGroup"),
                    },
                    ...groupOptions,
                  ]}
                />
              </FormField>
              {onUpdateHypotheses ? (
                <FormField label={t("telegram.posts.editor.hypothesis")}>
                  <MultiSelect
                    value={selectedRow.hypothesisRefs ?? []}
                    onChange={(refs) =>
                      onUpdateHypotheses(selectedRowIndex, refs)
                    }
                    disabled={disabled}
                    options={hypothesisOptions}
                    placeholder={t(
                      "telegram.posts.hypotheses.selectPlaceholder",
                    )}
                  />
                </FormField>
              ) : null}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <FormField label={t("telegram.posts.import.date")}>
                <DateInput
                  value={selectedRow.scheduledAt?.slice(0, 10) ?? ""}
                  disabled={disabled}
                  onChange={(event) => {
                    const time =
                      selectedRow.scheduledAt?.slice(11, 16) ?? "09:00";
                    const scheduledAt = event.target.value
                      ? new Date(
                          `${event.target.value}T${time}:00`,
                        ).toISOString()
                      : null;
                    updateScheduledAt(scheduledAt);
                  }}
                />
              </FormField>
              <FormField label={t("telegram.posts.import.time")}>
                <TimeInput
                  value={selectedRow.scheduledAt?.slice(11, 16) ?? ""}
                  disabled={disabled}
                  onChange={(event) => {
                    const date = selectedRow.scheduledAt?.slice(0, 10);
                    if (date) {
                      updateScheduledAt(
                        new Date(
                          `${date}T${event.target.value}:00`,
                        ).toISOString(),
                      );
                    }
                  }}
                />
              </FormField>
            </div>
            {onScheduleChange ? (
              <FormField label={t("telegram.posts.schedules.chooseSlot")}>
                <PublicationSlotOptions
                  channelId={channelId}
                  selectedDate={
                    selectedRow.scheduledAt?.slice(0, 10) ??
                    localDateKey(new Date())
                  }
                  value={
                    scheduleValue?.slotId && scheduleValue.scheduledAt
                      ? `${scheduleValue.slotId}:${scheduleValue.scheduledAt}`
                      : null
                  }
                  disabled={disabled}
                  onChange={(value) =>
                    onScheduleChange(selectedRowIndex, value)
                  }
                />
              </FormField>
            ) : null}
            <div>
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                disabled={disabled || !selectedRow.scheduledAt}
                onClick={() => updateScheduledAt(null, null)}
              >
                {t("telegram.posts.import.clearSchedule")}
              </Button>
            </div>
          </div>
        ) : null}

        <ManagedPostsImportList
          rows={rows}
          visibleRowIndices={visibleRowIndices}
          selectedRowIndex={selectedRowIndex}
          activeTab={activeTab}
          tabCounts={tabCounts}
          disabled={disabled}
          onSelectRow={onSelectRow}
          onSelectTab={onSelectTab}
        />
      </div>
    </div>
  );
}
