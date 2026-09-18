"use client";

import { useState } from "react";
import {
  CalendarClock,
  ExternalLink,
  Eye,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type {
  TelegramUnifiedImportManifest,
  TelegramUnifiedImportPreviewItem,
  TelegramUnifiedImportSectionResult,
} from "@telegram-system/shared";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { buildTelegramPostsUrl } from "@/lib/features/telegram/telegram-posts-url";
import { useI18n } from "@/providers/i18n-provider";
import { PublicationSlotOccurrenceSelect } from "./publication-slot-occurrence-select";
import { TelegramPostPreview } from "./telegram-post-preview";
import { ActionBadge } from "./unified-import-entities-preview";
import {
  ImportStateBadge,
  UnifiedImportStateTabs,
  type UnifiedImportState,
} from "./unified-import-state-tabs";

type CalendarRow = {
  item: TelegramUnifiedImportPreviewItem;
  operation: NonNullable<TelegramUnifiedImportManifest["schedule"]>[number];
  index: number;
};

export function UnifiedImportCalendarPreview({
  manifest,
  previewItems,
  channelId,
  channelTitle,
  channelPhotoUrl,
  disabled,
  failures = [],
  operationFilter,
  onChange,
  onOpenNewPost,
}: {
  manifest: TelegramUnifiedImportManifest;
  previewItems: TelegramUnifiedImportPreviewItem[];
  channelId: string;
  channelTitle: string;
  channelPhotoUrl?: string | null;
  disabled: boolean;
  failures?: TelegramUnifiedImportSectionResult["failed"];
  operationFilter?: "SCHEDULE" | "UNSCHEDULE";
  onChange: (manifest: TelegramUnifiedImportManifest) => void;
  onOpenNewPost: (postRef: string) => void;
}) {
  const { locale, t } = useI18n();
  const [state, setState] = useState<UnifiedImportState>("pending");
  const [previewRef, setPreviewRef] = useState<string | null>(null);
  const [editingRef, setEditingRef] = useState<string | null>(null);
  const operations = manifest.schedule ?? [];
  const posts = (manifest.posts ?? []).filter(
    (post) => post.action !== "DELETE",
  );
  const postsByRef = new Map(posts.map((post) => [post.ref, post]));
  const rows = operations.flatMap((operation, index) => {
    const item = previewItems[index];
    return item &&
      (!operationFilter || (operation.action ?? "SCHEDULE") === operationFilter)
      ? [{ item, operation, index }]
      : [];
  });
  const visibleRows = rows.filter(
    ({ operation }) => Boolean(operation.imported) === (state === "imported"),
  );
  const grouped = (() => {
    const result = new Map<string, CalendarRow[]>();
    for (const row of visibleRows) {
      const date =
        row.item.scheduledAt?.slice(0, 10) ??
        row.operation.scheduledAt?.slice(0, 10) ??
        "";
      const key = date || "unknown";
      result.set(key, [...(result.get(key) ?? []), row]);
    }
    return [...result.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    );
  })();

  const replaceOperation = (
    index: number,
    operation: NonNullable<TelegramUnifiedImportManifest["schedule"]>[number],
  ) => {
    const schedule = [...operations];
    schedule[index] = { ...operation, imported: false };
    onChange({ ...manifest, schedule });
  };
  const updateSchedule = (
    index: number,
    value: { slotId: string | null; scheduledAt: string },
  ) => {
    replaceOperation(index, {
      ...operations[index],
      action: "SCHEDULE",
      slotId: value.slotId ?? undefined,
      scheduledAt: value.scheduledAt,
    });
  };
  return (
    <div className="space-y-3 rounded-lg border border-blue-900/60 bg-blue-950/10 p-3">
      <UnifiedImportStateTabs
        value={state}
        pendingCount={
          rows.filter(({ operation }) => !operation.imported).length
        }
        importedCount={
          rows.filter(({ operation }) => operation.imported).length
        }
        onChange={setState}
      />
      {grouped.map(([date, dayRows]) => (
        <section
          key={date}
          className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950/70"
        >
          <header className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <CalendarClock size={15} className="text-neutral-400" />
              {date === "unknown"
                ? t("telegram.posts.import.unknownScheduleDate")
                : new Date(`${date}T12:00:00`).toLocaleDateString(
                    locale === "ru" ? "ru-RU" : "en-GB",
                    { weekday: "long", day: "numeric", month: "long" },
                  )}
            </div>
            <span className="text-xs text-neutral-500">
              {t("telegram.posts.import.postsCount", { count: dayRows.length })}
            </span>
          </header>
          <div className="divide-y divide-neutral-800">
            {dayRows.map(({ item, operation, index }) => {
              const post = operation.postRef
                ? postsByRef.get(operation.postRef)
                : posts.find((candidate) => candidate.id === operation.postId);
              const postId = operation.postId ?? post?.id ?? item.entityId;
              const title =
                post?.title ||
                item.label ||
                t("telegram.posts.import.untitled");
              const scheduledAt = item.scheduledAt ?? operation.scheduledAt;
              const failure = failures.find(
                (candidate) =>
                  candidate.ref === (operation.postRef ?? operation.postId),
              );
              const expanded = previewRef === item.ref;
              return (
                <article key={`${item.ref}:${index}`} className="space-y-3 p-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <ActionBadge action={operation.action ?? "SCHEDULE"} />
                    <ImportStateBadge imported={operation.imported} />
                    {item.iconPresentation ? (
                      <IconAvatar
                        icon={item.iconPresentation}
                        label={title}
                        size="xs"
                        bordered={false}
                        decorative
                      />
                    ) : null}
                    <strong className="min-w-[180px] flex-1 truncate text-sm text-neutral-100">
                      {title}
                    </strong>
                    {scheduledAt ? (
                      <span className="text-xs tabular-nums text-neutral-400">
                        {new Date(scheduledAt).toLocaleTimeString(
                          locale === "ru" ? "ru-RU" : "en-GB",
                          {
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        )}
                      </span>
                    ) : null}
                    {item.slotKind ? (
                      <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-300">
                        {item.slotKind === "AD" ? "📣" : "📝"}{" "}
                        {item.slotTitle || item.slotKind}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      aria-label={t(
                        "telegram.posts.import.inlinePreviewNamed",
                        { title },
                      )}
                      onClick={() => setPreviewRef(expanded ? null : item.ref)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
                    >
                      <Eye size={13} />{" "}
                      {t("telegram.posts.import.inlinePreview")}
                    </button>
                    <button
                      type="button"
                      disabled={disabled || !postId}
                      aria-label={t("telegram.posts.import.editScheduleNamed", {
                        title,
                      })}
                      onClick={() =>
                        setEditingRef(editingRef === item.ref ? null : item.ref)
                      }
                      className="rounded-md border border-neutral-700 p-1.5 text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
                    >
                      <Pencil size={13} />
                    </button>
                    {postId ? (
                      <a
                        href={buildTelegramPostsUrl({
                          channelId,
                          postId,
                          postView: "editor",
                        })}
                        aria-label={t("telegram.posts.support.openNamed", {
                          title,
                        })}
                        className="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 px-2 py-1 text-xs text-blue-300 hover:bg-blue-950"
                      >
                        <ExternalLink size={13} />{" "}
                        {t("telegram.posts.import.openInSystem")}
                      </a>
                    ) : operation.postRef ? (
                      <button
                        type="button"
                        aria-label={t("telegram.posts.support.openNamed", {
                          title,
                        })}
                        disabled={disabled}
                        onClick={() => onOpenNewPost(operation.postRef!)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 px-2 py-1 text-xs text-blue-300 hover:bg-blue-950 disabled:opacity-50"
                      >
                        <ExternalLink size={13} />{" "}
                        {t("telegram.posts.import.openInSystem")}
                      </button>
                    ) : null}
                    {operation.action === "UNSCHEDULE" ? (
                      <button
                        type="button"
                        disabled={disabled || !operation.postId}
                        onClick={() =>
                          replaceOperation(index, {
                            action: "SCHEDULE",
                            postId: operation.postId,
                            slotId: item.slotId ?? undefined,
                            scheduledAt: scheduledAt ?? undefined,
                            slotKind: item.slotKind ?? undefined,
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-950 disabled:opacity-50"
                      >
                        <RefreshCw size={13} />{" "}
                        {t("telegram.posts.import.reschedule")}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={disabled}
                      className="rounded-md border border-rose-900/70 p-1.5 text-rose-300 hover:bg-rose-950 disabled:opacity-50"
                      aria-label={t("telegram.posts.import.removeOperation")}
                      onClick={() =>
                        onChange({
                          ...manifest,
                          schedule: operations.filter(
                            (_, candidate) => candidate !== index,
                          ),
                        })
                      }
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  {expanded ? (
                    <div className="mx-auto max-w-xl overflow-hidden rounded-lg border border-blue-900/60 bg-[#0e1b26]">
                      <TelegramPostPreview
                        channelTitle={channelTitle}
                        channelPhotoUrl={channelPhotoUrl}
                        text={item.text ?? post?.text ?? ""}
                        imageUrls={item.imageUrls ?? post?.imageUrls ?? []}
                      />
                    </div>
                  ) : null}
                  {editingRef === item.ref ? (
                    <PublicationSlotOccurrenceSelect
                      channelId={channelId}
                      value={
                        (operation.slotId ?? item.slotId) && scheduledAt
                          ? `${operation.slotId ?? item.slotId}:${scheduledAt}`
                          : null
                      }
                      scheduledAt={scheduledAt}
                      disabled={disabled}
                      onChange={(value) => updateSchedule(index, value)}
                    />
                  ) : null}
                  {failure?.error ? (
                    <p className="rounded-md border border-rose-900/70 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">
                      {failure.error}
                    </p>
                  ) : null}
                  {item.errors.length ? (
                    <p
                      role="alert"
                      className="rounded-md border border-rose-900/70 bg-rose-950/30 px-3 py-2 text-xs text-rose-200"
                    >
                      {item.errors.join("; ")}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ))}
      {!visibleRows.length ? (
        <p className="rounded-lg border border-dashed border-neutral-800 p-5 text-center text-sm text-neutral-500">
          {t("telegram.posts.import.emptyCalendarState")}
        </p>
      ) : null}
    </div>
  );
}
