"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import type {
  TelegramUnifiedImportManifest,
  TelegramUnifiedImportPreviewItem,
} from "@telegram-system/shared";
import { Button, CustomSelect } from "@/components/ui/primitives";
import { buildTelegramPostsUrl } from "@/lib/features/telegram/telegram-posts-url";
import { useI18n } from "@/providers/i18n-provider";
import { PublicationSlotOccurrenceSelect } from "./publication-slot-occurrence-select";
import { UnifiedImportDeletePreview } from "./unified-import-delete-preview";

export function UnifiedImportCalendarPreview({
  manifest,
  previewItems,
  channelId,
  channelTitle,
  channelPhotoUrl,
  disabled,
  onChange,
}: {
  manifest: TelegramUnifiedImportManifest;
  previewItems: TelegramUnifiedImportPreviewItem[];
  channelId: string;
  channelTitle: string;
  channelPhotoUrl?: string | null;
  disabled: boolean;
  onChange: (manifest: TelegramUnifiedImportManifest) => void;
}) {
  const { locale, t } = useI18n();
  const [addingPostRef, setAddingPostRef] = useState("");
  const [showAddSlot, setShowAddSlot] = useState(false);
  const [operation, setOperation] = useState<"schedule" | "unschedule">(
    "schedule",
  );
  const scheduleOperations = (manifest.schedule ?? []).filter(
    (item) => item.action !== "UNSCHEDULE",
  );
  const unscheduleItems = previewItems.filter(
    (item) => item.action === "UNSCHEDULE",
  );
  const resolvedOperation = scheduleOperations.length
    ? operation
    : unscheduleItems.length
      ? "unschedule"
      : "schedule";
  const posts = (manifest.posts ?? []).filter(
    (post) => post.action !== "DELETE" && !post.imported,
  );
  const postsByRef = new Map(posts.map((post) => [post.ref, post]));
  const grouped = useMemo(() => {
    const result = new Map<
      string,
      NonNullable<TelegramUnifiedImportManifest["schedule"]>
    >();
    for (const item of scheduleOperations) {
      const date = item.scheduledAt?.slice(0, 10) ?? "";
      if (!date) continue;
      result.set(date, [...(result.get(date) ?? []), item]);
    }
    return [...result.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    );
  }, [scheduleOperations]);
  const updateSchedule = (
    index: number,
    value: { slotId: string | null; scheduledAt: string },
  ) => {
    if (!value.slotId) return;
    const schedule = [...(manifest.schedule ?? [])];
    schedule[index] = {
      ...schedule[index],
      action: "SCHEDULE",
      slotId: value.slotId,
      scheduledAt: value.scheduledAt,
    };
    onChange({ ...manifest, schedule });
  };
  return (
    <div className="space-y-3 rounded-lg border border-blue-900/60 bg-blue-950/10 p-3">
      {scheduleOperations.length && unscheduleItems.length ? (
        <div
          role="tablist"
          aria-label={t("telegram.posts.import.scheduleOperations")}
          className="flex flex-wrap gap-2"
        >
          <button
            type="button"
            role="tab"
            aria-selected={resolvedOperation === "schedule"}
            onClick={() => setOperation("schedule")}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${resolvedOperation === "schedule" ? "border-emerald-400 bg-emerald-950/80 text-emerald-100" : "border-emerald-900/80 bg-emerald-950/25 text-emerald-400 hover:border-emerald-600"}`}
          >
            {t("telegram.posts.import.scheduleTab", {
              count: scheduleOperations.length,
            })}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={resolvedOperation === "unschedule"}
            onClick={() => setOperation("unschedule")}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${resolvedOperation === "unschedule" ? "border-rose-400 bg-rose-950/80 text-rose-100" : "border-rose-900/80 bg-rose-950/25 text-rose-400 hover:border-rose-600"}`}
          >
            {t("telegram.posts.import.unscheduleTab", {
              count: unscheduleItems.length,
            })}
          </button>
        </div>
      ) : null}
      {resolvedOperation === "unschedule" ? (
        <UnifiedImportDeletePreview
          section="posts"
          items={unscheduleItems}
          channelId={channelId}
          channelTitle={channelTitle}
          channelPhotoUrl={channelPhotoUrl}
          operation="UNSCHEDULE"
        />
      ) : null}
      {resolvedOperation === "schedule"
        ? grouped.map(([date, items]) => (
            <section
              key={date}
              className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950/70"
            >
              <header className="border-b border-neutral-800 px-3 py-2">
                <div className="text-sm font-medium text-white">
                  {new Date(`${date}T12:00:00`).toLocaleDateString(
                    locale === "ru" ? "ru-RU" : "en-GB",
                    { weekday: "long", day: "numeric", month: "short" },
                  )}
                </div>
                <div className="text-xs text-neutral-500">
                  {t("telegram.posts.import.postsCount", {
                    count: items.length,
                  })}
                </div>
              </header>
              <div className="divide-y divide-neutral-800">
                {items.map((item) => {
                  const absoluteIndex = (manifest.schedule ?? []).indexOf(item);
                  const post = item.postRef
                    ? postsByRef.get(item.postRef)
                    : undefined;
                  const previewItem = previewItems.find(
                    (candidate) =>
                      candidate.action === "SCHEDULE" &&
                      ((item.postRef && candidate.ref === item.postRef) ||
                        (item.postId && candidate.entityId === item.postId)),
                  );
                  const postId =
                    post?.id ?? previewItem?.entityId ?? item.postId;
                  const title =
                    post?.title ||
                    previewItem?.label ||
                    item.postRef ||
                    item.postId;
                  const icon = post?.icon || previewItem?.icon || "📝";
                  return (
                    <div
                      key={`${item.postRef ?? item.postId}:${item.scheduledAt}`}
                      className="space-y-3 p-3"
                    >
                      <div className="flex items-center gap-2 text-sm">
                        <span className="min-w-0 flex-1 truncate font-medium text-neutral-100">
                          {icon} {title}
                        </span>
                        {postId ? (
                          <a
                            href={buildTelegramPostsUrl({
                              channelId,
                              postId,
                              postView: "editor",
                            })}
                            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 px-2 py-1 text-xs text-blue-300 hover:bg-blue-950"
                            aria-label={t("telegram.posts.support.openNamed", {
                              title: title || postId,
                            })}
                          >
                            <ExternalLink size={14} />{" "}
                            {t("telegram.posts.import.openInSystem")}
                          </a>
                        ) : (
                          <button
                            type="button"
                            disabled
                            title={t("telegram.posts.import.openAfterImport")}
                            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 px-2 py-1 text-xs text-neutral-600"
                          >
                            <ExternalLink size={14} />{" "}
                            {t("telegram.posts.import.openInSystem")}
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={disabled}
                          className="rounded p-1.5 text-rose-300 hover:bg-rose-950"
                          aria-label="Remove schedule"
                          onClick={() =>
                            onChange({
                              ...manifest,
                              schedule: (manifest.schedule ?? []).filter(
                                (_, index) => index !== absoluteIndex,
                              ),
                            })
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <PublicationSlotOccurrenceSelect
                        channelId={channelId}
                        value={`${item.slotId}:${item.scheduledAt}`}
                        scheduledAt={item.scheduledAt}
                        disabled={disabled}
                        onChange={(value) =>
                          updateSchedule(absoluteIndex, value)
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        : null}
      {resolvedOperation === "schedule" ? (
        <div className="rounded-lg border border-dashed border-neutral-700 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[240px] flex-1">
              <CustomSelect
                value={addingPostRef}
                onChange={setAddingPostRef}
                options={[
                  {
                    value: "",
                    label: t("telegram.posts.import.selectPublication"),
                  },
                  ...posts
                    .filter(
                      (post) =>
                        !(manifest.schedule ?? []).some(
                          (item) => item.postRef === post.ref,
                        ),
                    )
                    .map((post) => ({
                      value: post.ref,
                      label: post.title || post.ref,
                      iconEmoji: post.icon || "📝",
                    })),
                ]}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={!addingPostRef || disabled}
              onClick={() => setShowAddSlot(true)}
            >
              <Plus size={15} /> {t("telegram.posts.import.addSlot")}
            </Button>
          </div>
          {showAddSlot && addingPostRef ? (
            <div className="mt-3">
              <PublicationSlotOccurrenceSelect
                channelId={channelId}
                value={null}
                disabled={disabled}
                onChange={(value) => {
                  if (!value.slotId) return;
                  onChange({
                    ...manifest,
                    schedule: [
                      ...(manifest.schedule ?? []),
                      {
                        action: "SCHEDULE",
                        postRef: addingPostRef,
                        slotId: value.slotId,
                        scheduledAt: value.scheduledAt,
                      },
                    ],
                  });
                  setAddingPostRef("");
                  setShowAddSlot(false);
                }}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
