"use client";

import { ExternalLink } from "lucide-react";
import { TelegramPostPreview } from "@/components/features/telegram/telegram/telegram-post-preview";
import { Modal } from "@/components/ui/primitives";
import type { TelegramPost } from "@/lib/api";

export function TelegramPostPreviewModal({
  open,
  onClose,
  channelTitle,
  channelPhotoUrl,
  post,
}: {
  open: boolean;
  onClose: () => void;
  channelTitle: string;
  channelPhotoUrl?: string | null;
  post: TelegramPost | null;
}) {
  const telegramUrl = post?.primaryTelegramMessageUrl || null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Post preview"
      size="xl"
    >
      {post ? (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(260px,0.78fr)_minmax(0,1.22fr)]">
          <TelegramPostPreview
            channelTitle={channelTitle}
            channelPhotoUrl={channelPhotoUrl}
            text={post.text || ""}
            formattedHtml={post.formattedText || null}
            imageUrls={post.imageUrls}
            hasMedia={post.hasMedia}
          />
          <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/25 p-4">
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
                Telegram link
              </p>
              {telegramUrl ? (
                <a
                  href={telegramUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 break-all rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm text-blue-300 transition-colors hover:border-slate-500 hover:text-blue-200"
                >
                  <span>{telegramUrl}</span>
                  <ExternalLink size={15} className="shrink-0" />
                </a>
              ) : (
                <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-400">
                  Telegram link is unavailable for this post.
                </div>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                <p className="text-xs text-slate-500">Date</p>
                <p className="mt-1 text-sm font-medium text-white">
                  {post.postDate?.slice(0, 10) || "-"}
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                <p className="text-xs text-slate-500">Message ID</p>
                <p className="mt-1 text-sm font-medium text-white">
                  {post.telegramMessageId || "-"}
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                <p className="text-xs text-slate-500">Views</p>
                <p className="mt-1 text-sm font-medium text-white">
                  {Number(post.viewsCount || 0).toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                <p className="text-xs text-slate-500">Reactions</p>
                <p className="mt-1 text-sm font-medium text-white">
                  {Number(post.reactionsCount || 0).toLocaleString()}
                </p>
              </div>
            </div>

            {post.hasMedia && !post.imageUrls.length ? (
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-400">
                Media preview is available only for image posts.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
