"use client";

import { ExternalLink } from "lucide-react";
import type { TelegramUnifiedImportPreviewItem } from "@telegram-system/shared";
import { useI18n } from "@/providers/i18n-provider";
import { buildTelegramPostsUrl } from "@/lib/features/telegram/telegram-posts-url";
import { TelegramPostPreview } from "./telegram-post-preview";
import { ActionBadge } from "./unified-import-entities-preview";

export function UnifiedImportDeletePreview({
  section,
  items,
  channelId,
  channelTitle,
  channelPhotoUrl,
  operation = "DELETE",
}: {
  section: "posts" | "groups" | "hypotheses";
  items: TelegramUnifiedImportPreviewItem[];
  channelId: string;
  channelTitle: string;
  channelPhotoUrl?: string | null;
  operation?: "DELETE" | "UNSCHEDULE";
}) {
  const { t } = useI18n();
  if (!items.length) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-800 p-5 text-center text-sm text-neutral-500">
        {t("telegram.posts.import.emptyDeleteTab")}
      </p>
    );
  }
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {items.map((item) => (
        <article key={item.ref} className="overflow-hidden rounded-lg border border-rose-900/60 bg-rose-950/10">
          <div className="flex items-center gap-2 border-b border-rose-950 px-3 py-2">
            <ActionBadge action={operation} />
            {item.icon ? <span className="text-lg">{item.icon}</span> : null}
            <strong className="min-w-0 flex-1 truncate text-sm text-white">{item.label}</strong>
            {section === "posts" && item.entityId ? (
              <a
                href={buildTelegramPostsUrl({ channelId, postId: item.entityId, postView: "editor" })}
                className="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 px-2 py-1 text-xs text-blue-300 hover:bg-blue-950/50"
                aria-label={t("telegram.posts.support.openNamed", { title: item.label })}
              >
                <ExternalLink size={13} /> {t("telegram.posts.import.openInSystem")}
              </a>
            ) : null}
          </div>
          {section === "posts" ? (
            <div className="min-h-[280px] bg-[#0e1b26]">
              <TelegramPostPreview
                channelTitle={channelTitle}
                channelPhotoUrl={channelPhotoUrl}
                text={item.text ?? ""}
                imageUrls={item.imageUrls ?? []}
              />
            </div>
          ) : (
            <div className="space-y-2 p-3">
              {item.description ? <p className="whitespace-pre-wrap text-sm text-neutral-300">{item.description}</p> : null}
              {item.status ? <span className="inline-flex rounded-full border border-neutral-700 px-2 py-0.5 text-xs text-neutral-300">{item.status}</span> : null}
            </div>
          )}
          {item.errors.length ? <p className="border-t border-rose-900/50 px-3 py-2 text-xs text-rose-300">{item.errors.join("; ")}</p> : null}
        </article>
      ))}
    </div>
  );
}
