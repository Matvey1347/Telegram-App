"use client";

import { Clock3, FileText, Plus, Rocket, Trash2 } from "lucide-react";
import type { TelegramPostBatchPost } from "@telegram-system/shared";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { Button } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/date-format";
import { useI18n } from "@/providers/i18n-provider";
import { postBatchFormatLabel } from "./post-batch-format";

export function PostBatchPublications({
  posts,
  selectedPostId,
  editable,
  busy,
  onSelect,
  onRemove,
  onAdd,
}: {
  posts: TelegramPostBatchPost[];
  selectedPostId?: string;
  editable: boolean;
  busy: boolean;
  onSelect: (postId: string) => void;
  onRemove?: (postId: string) => void;
  onAdd?: () => void;
}) {
  const { locale, t } = useI18n();

  return (
    <aside
      data-testid="post-batch-publications"
      className="min-w-0 rounded-xl border border-neutral-800 bg-neutral-950/45 p-2 lg:col-start-2 lg:row-start-1 lg:self-start"
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
          {t("telegram.posts.batch.publications")}
        </span>
        <span className="text-xs text-neutral-500">{posts.length}</span>
      </div>
      <div className="space-y-2">
        {posts.map((post, index) => {
          const selected = selectedPostId === post.id;
          const scheduleLabel =
            post.action === "SCHEDULE"
              ? post.scheduledAt
                ? formatDateTime(post.scheduledAt, locale)
                : t("telegram.posts.batch.schedule")
              : t("telegram.posts.batch.publishNow");
          return (
            <div
              key={post.id}
              role="button"
              tabIndex={0}
              data-testid={`post-batch-publication-${post.id}`}
              onClick={() => onSelect(post.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(post.id);
                }
              }}
              className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left outline-none transition ${selected ? "border-blue-500 bg-blue-950/30" : "border-neutral-800 hover:bg-neutral-900"}`}
            >
              <span
                aria-hidden="true"
                className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md border border-neutral-700 bg-neutral-950 px-1.5 text-[11px] font-medium tabular-nums text-neutral-300"
              >
                {index + 1}
              </span>
              {post.iconPresentation ? (
                <IconAvatar
                  icon={post.iconPresentation}
                  label={post.title}
                  size="xs"
                  bordered={false}
                  className="!bg-transparent"
                />
              ) : (
                <FileText size={15} className="shrink-0 text-neutral-400" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-white">
                  {post.title}
                </span>
                <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-neutral-500">
                  {post.action === "SCHEDULE" ? (
                    <Clock3 size={11} className="shrink-0" />
                  ) : (
                    <Rocket size={11} className="shrink-0" />
                  )}
                  <span className="truncate">{scheduleLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span className="shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-300">
                    {postBatchFormatLabel(post.deleteAfterHours)}
                  </span>
                </span>
              </span>
              {onRemove && posts.length > 1 ? (
                <button
                  type="button"
                  aria-label={t("telegram.posts.batch.deletePost", {
                    title: post.title,
                  })}
                  className="shrink-0 rounded-md border border-red-800 p-1.5 text-red-300 transition hover:bg-red-950"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemove(post.id);
                  }}
                >
                  <Trash2 size={14} />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {editable && onAdd ? (
        <div className="mt-2 border-t border-neutral-800 pt-2">
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={busy}
            onClick={onAdd}
          >
            <Plus size={16} /> {t("telegram.posts.batch.addPost")}
          </Button>
        </div>
      ) : null}
    </aside>
  );
}
