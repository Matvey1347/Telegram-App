"use client";

import { AlertTriangle } from "lucide-react";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { TooltipBubble } from "@/components/ui/primitives";
import type { TelegramManagedPost } from "@/lib/api";

export type ManagedPostInternalLink = {
  targetId: string;
  labels: string[];
  target?: TelegramManagedPost;
};

const internalPostLinkPattern = /\[([^\]\n]+)\]\(tg-post:([a-zA-Z0-9_-]+)\)/g;

export function buildManagedPostInternalLinks(
  text: string,
  posts?: TelegramManagedPost[],
): ManagedPostInternalLink[] {
  const grouped = new Map<string, ManagedPostInternalLink>();

  for (const match of text.matchAll(internalPostLinkPattern)) {
    const label = match[1]?.trim() || match[2];
    const targetId = match[2];
    const existing = grouped.get(targetId);
    if (existing) {
      if (!existing.labels.includes(label)) existing.labels.push(label);
      continue;
    }
    grouped.set(targetId, {
      targetId,
      labels: [label],
      target: posts?.find((post) => post.id === targetId),
    });
  }

  return [...grouped.values()];
}

export function isManagedPostInternalLinkReady(
  post: TelegramManagedPost | undefined,
  channelTelegramChatId?: string | null,
) {
  return Boolean(
    post &&
    post.status === "PUBLISHED" &&
    post.telegramRemoteStatus === "PUBLISHED" &&
    post.telegramIdVerificationStatus === "VERIFIED" &&
    post.telegramMessageIds.length > 0 &&
    channelTelegramChatId &&
    !post.lastError,
  );
}

export function hasBlockingManagedPostInternalLinks(
  links: ManagedPostInternalLink[],
  channelTelegramChatId?: string | null,
) {
  return links.some(
    (link) =>
      !isManagedPostInternalLinkReady(link.target, channelTelegramChatId),
  );
}

export function canScheduleManagedPost(
  post: TelegramManagedPost,
  posts: TelegramManagedPost[],
  channelTelegramChatId?: string | null,
) {
  return !hasBlockingManagedPostInternalLinks(
    buildManagedPostInternalLinks(post.text || "", posts),
    channelTelegramChatId,
  );
}

function postStatusLabel(post?: TelegramManagedPost) {
  if (!post) return null;
  if (
    post.status === "PUBLISHED" &&
    (post.telegramRemoteStatus === "BROKEN" ||
      post.telegramRemoteStatus === "MISSING" ||
      post.lastError)
  ) {
    return "link broken";
  }
  return post.status.toLowerCase();
}

export function ManagedPostInternalLinksNotice({
  links,
  channelTelegramChatId,
  onHighlightTarget,
  onOpenPostInNewTab,
  allowUnresolved = false,
}: {
  links: ManagedPostInternalLink[];
  channelTelegramChatId?: string | null;
  onHighlightTarget?: (targetId: string) => void;
  onOpenPostInNewTab?: (post: TelegramManagedPost) => void;
  allowUnresolved?: boolean;
}) {
  if (!links.length) return null;

  const unresolved = links
    .map((link) =>
      isManagedPostInternalLinkReady(link.target, channelTelegramChatId)
        ? null
        : { id: link.targetId, post: link.target },
    )
    .filter(
      (
        target,
      ): target is { id: string; post: TelegramManagedPost | undefined } =>
        Boolean(target),
    );
  const resolved = links.filter((link) =>
    isManagedPostInternalLinkReady(link.target, channelTelegramChatId),
  );

  return (
    <div className="rounded-lg border border-amber-700/70 bg-amber-950/20 px-3 py-2.5 text-amber-200">
      <div className="flex items-start gap-2">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {unresolved.length
              ? allowUnresolved
                ? "Linked posts will be repaired before publication"
                : "Publishing is blocked by linked posts"
              : "Internal linked posts are ready"}
          </p>
          <p className="mt-0.5 text-xs text-amber-300/80">
            {unresolved.length
              ? allowUnresolved
                ? "You can schedule this series now. Links stay non-clickable until each earlier post is published and verified:"
                : "Publish these posts or attach their Telegram links first:"
              : "All linked posts are already ready for publishing."}
          </p>
          {unresolved.length ? (
            <div className="mt-3">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-300/75">
                {allowUnresolved ? "Pending verification" : "Blocking"}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {unresolved.map((target) => (
                  <ManagedPostInternalLinkPill
                    key={target.id}
                    id={target.id}
                    post={target.post}
                    tone={allowUnresolved ? "pending" : "blocking"}
                    onHighlightTarget={onHighlightTarget}
                    onOpenPostInNewTab={onOpenPostInNewTab}
                  />
                ))}
              </div>
            </div>
          ) : null}
          {resolved.length ? (
            <div className="mt-3">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-300/75">
                Ready
              </p>
              <div className="flex flex-wrap gap-1.5">
                {resolved.map((target) => (
                  <ManagedPostInternalLinkPill
                    key={target.targetId}
                    id={target.targetId}
                    post={target.target}
                    tone="ready"
                    onHighlightTarget={onHighlightTarget}
                    onOpenPostInNewTab={onOpenPostInNewTab}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ManagedPostInternalLinkPill({
  id,
  post,
  tone,
  onHighlightTarget,
  onOpenPostInNewTab,
}: {
  id: string;
  post?: TelegramManagedPost;
  tone: "blocking" | "pending" | "ready";
  onHighlightTarget?: (targetId: string) => void;
  onOpenPostInNewTab?: (post: TelegramManagedPost) => void;
}) {
  const ready = tone === "ready";
  const status = ready ? "published" : postStatusLabel(post);
  return (
    <span className="relative inline-flex group">
      <button
        type="button"
        onClick={(event) => {
          if (post && (event.metaKey || event.ctrlKey)) {
            onOpenPostInNewTab?.(post);
            return;
          }
          onHighlightTarget?.(id);
        }}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition ${
          ready
            ? "border-emerald-800/70 bg-emerald-950/30 text-emerald-100 hover:border-emerald-600 hover:bg-emerald-900/30"
            : "border-amber-800/70 bg-amber-950/50 hover:border-amber-600 hover:bg-amber-900/40"
        }`}
      >
        {post?.icon || post?.iconPresentation ? (
          <IconAvatar
            icon={post.iconPresentation}
            label={post.title}
            size="xs"
            bordered={false}
            className="!bg-transparent"
          />
        ) : (
          <span aria-hidden="true">📝</span>
        )}
        <span>{post?.title || (ready ? id : `Missing post ${id}`)}</span>
        {status ? (
          <span className={ready ? "text-emerald-300/80" : "text-amber-400/70"}>
            {status}
          </span>
        ) : null}
      </button>
      <TooltipBubble
        side="top"
        align="center"
        className="max-w-64 px-2.5 py-1.5 text-neutral-200 opacity-0 transition-opacity group-hover:opacity-100"
      >
        Click to jump to this link in the text.
        {onOpenPostInNewTab ? " Cmd/Ctrl-click opens it in a new tab." : ""}
      </TooltipBubble>
    </span>
  );
}
