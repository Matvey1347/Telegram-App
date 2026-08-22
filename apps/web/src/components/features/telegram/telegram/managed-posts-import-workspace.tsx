"use client";

import { useMemo, useRef, useState } from "react";
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
  Textarea,
  TimeInput,
} from "@/components/ui/primitives";
import type { TelegramManagedPost } from "@/lib/api";
import { buildTelegramPostsUrl } from "@/lib/features/telegram/telegram-posts-url";
import { ManagedPostsImportList } from "./managed-posts-import-list";
import {
  importIconPresentation,
  urlsTextToArray,
  type EditableImportRow,
  type ImportRowTab,
} from "./managed-posts-import-model";
import type { ManagedPostsGroupOption } from "./managed-posts-import-source";

const noGroupValue = "__no_group__";
const useDefaultGroupValue = "__use_default_group__";

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
  managedPosts,
  groupOptions,
  onUpdateRow,
  onDeleteRow,
  onSelectRow,
  onSelectTab,
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
  managedPosts: TelegramManagedPost[];
  groupOptions: ManagedPostsGroupOption[];
  onUpdateRow: (index: number, patch: Partial<EditableImportRow>) => void;
  onDeleteRow: (index: number) => void;
  onSelectRow: (index: number) => void;
  onSelectTab: (tab: ImportRowTab) => void;
}) {
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
        ? buildManagedPostInternalLinks(selectedRow.text, managedPosts)
        : [],
    [managedPosts, selectedRow],
  );
  const iconPresentation = importIconPresentation(selectedRow?.icon ?? "");
  const iconId =
    selectedRow?.icon && !iconPresentation ? selectedRow.icon : null;
  const selectedPosition = visibleRowIndices.indexOf(selectedRowIndex);

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-100">
          <ListChecks size={16} />
          Preview & edit
          <span className="text-xs font-normal text-neutral-500">
            {selectedRowIndex + 1} of {rows.length}
          </span>
        </div>
        <div className="inline-flex items-center gap-2">
          <Button
            type="button"
            variant="danger"
            className="px-2 py-2"
            disabled={disabled}
            onClick={() => onDeleteRow(selectedRowIndex)}
            title="Delete post from import"
            aria-label="Delete post from import"
          >
            <Trash2 size={14} />
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="px-2 py-2"
            disabled={selectedPosition <= 0 || disabled}
            onClick={() => onSelectRow(visibleRowIndices[selectedPosition - 1])}
            aria-label="Previous post"
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
            aria-label="Next post"
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
                Approved
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
                Imported
              </label>
            </div>

            <div className="grid gap-2 sm:grid-cols-[48px_minmax(0,1fr)]">
              <FormField label="Icon">
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
                  buttonLabel="Add emoji"
                  className="!h-9 !w-9"
                  iconClassName="!h-6 !w-6 !bg-transparent"
                />
              </FormField>
              <FormField label="Title">
                <Input
                  value={selectedRow.title}
                  disabled={disabled}
                  onChange={(event) =>
                    onUpdateRow(selectedRowIndex, { title: event.target.value })
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
                disabled={disabled}
                channelId={channelId}
                enableInternalPostLinks
                internalLinkUsage="edit"
                highlightInternalLinkTargetId={highlightedTargetId}
                highlightRequestKey={highlightRequestKey}
                availableInternalPosts={managedPosts}
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
              <FormField label="Image URLs">
                <Textarea
                  rows={3}
                  value={selectedRow.urlsText}
                  disabled={disabled}
                  placeholder="One image URL per line"
                  className="font-mono text-xs"
                  onChange={(event) =>
                    onUpdateRow(selectedRowIndex, {
                      urlsText: event.target.value,
                    })
                  }
                />
              </FormField>
              <FormField label="Image search">
                <Textarea
                  rows={3}
                  value={selectedRow.imageSearchText}
                  disabled={disabled}
                  placeholder="One search query per line"
                  className="font-mono text-xs"
                  onChange={(event) =>
                    onUpdateRow(selectedRowIndex, {
                      imageSearchText: event.target.value,
                    })
                  }
                />
              </FormField>
            </div>

            <div className="grid gap-2 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,0.65fr)]">
              <FormField label="Post group">
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
                    { value: useDefaultGroupValue, label: "Use default group" },
                    ...groupOptions,
                  ]}
                />
              </FormField>
              <FormField label="Date">
                <DateInput
                  value={selectedRow.scheduledAt?.slice(0, 10) ?? ""}
                  disabled={disabled}
                  onChange={(event) => {
                    const time =
                      selectedRow.scheduledAt?.slice(11, 16) ?? "09:00";
                    onUpdateRow(selectedRowIndex, {
                      scheduledAt: event.target.value
                        ? new Date(
                            `${event.target.value}T${time}:00`,
                          ).toISOString()
                        : null,
                    });
                  }}
                />
              </FormField>
              <FormField label="Time">
                <TimeInput
                  value={selectedRow.scheduledAt?.slice(11, 16) ?? ""}
                  disabled={disabled}
                  onChange={(event) => {
                    const date = selectedRow.scheduledAt?.slice(0, 10);
                    if (date)
                      onUpdateRow(selectedRowIndex, {
                        scheduledAt: new Date(
                          `${date}T${event.target.value}:00`,
                        ).toISOString(),
                      });
                  }}
                />
              </FormField>
              <Button
                type="button"
                variant="secondary"
                className="md:col-span-2 md:col-start-2"
                disabled={disabled || !selectedRow.scheduledAt}
                onClick={() =>
                  onUpdateRow(selectedRowIndex, { scheduledAt: null })
                }
              >
                Clear schedule
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
