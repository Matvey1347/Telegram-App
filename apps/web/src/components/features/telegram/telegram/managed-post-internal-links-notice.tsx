"use client";


import { AlertTriangle } from "lucide-react";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { TooltipBubble } from "@/components/ui/primitives";
import type { TelegramManagedPost } from "@/lib/api";
import type { TelegramManagedPostLookupItem } from "@/lib/features/telegram/telegram-managed-posts-api";
import { telegramManagedPostStatusKey } from "@/lib/features/telegram/telegram-posts-i18n";
import { useI18n, type TranslationFunction } from "@/providers/i18n-provider";

type ManagedPostLinkTarget = Pick<
  TelegramManagedPostLookupItem,
  | "id"
  | "title"
  | "status"
  | "telegramRemoteStatus"
  | "telegramMessageIds"
  | "telegramIdVerificationStatus"
> & {
  lastError?: string | null;
  icon?: TelegramManagedPostLookupItem["icon"];
  iconPresentation?: TelegramManagedPostLookupItem["iconPresentation"];
};

export type ManagedPostInternalLink = {
  targetId: string;
  labels: string[];
  target?: ManagedPostLinkTarget;
};

const internalPostLinkPattern = /\[([^\]\n]+)\]\(tg-post:([a-zA-Z0-9_-]+)\)/g;

export function buildManagedPostInternalLinks(
  text: string,
  posts?: ManagedPostLinkTarget[],
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
  post: ManagedPostLinkTarget | undefined,
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

function postStatusLabel(t: TranslationFunction, post?: ManagedPostLinkTarget) {
  if (!post) return null;
  if (
    post.status === "PUBLISHED" &&
    (post.telegramRemoteStatus === "BROKEN" ||
      post.telegramRemoteStatus === "MISSING" ||
      post.lastError)
  ) {
    return t("telegram.posts.links.broken");
  }
  return t(telegramManagedPostStatusKey(post.status));
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
  onOpenPostInNewTab?: (post: ManagedPostLinkTarget) => void;
  allowUnresolved?: boolean;
}) {
  const { t } = useI18n();
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
      ): target is { id: string; post: ManagedPostLinkTarget | undefined } =>
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
                ? t("telegram.posts.links.repairTitle")
                : t("telegram.posts.links.blockedTitle")
              : t("telegram.posts.links.readyTitle")}
          </p>
          <p className="mt-0.5 text-xs text-amber-300/80">
            {unresolved.length
              ? allowUnresolved
                ? t("telegram.posts.links.repairDescription")
                : t("telegram.posts.links.blockedDescription")
              : t("telegram.posts.links.readyDescription")}
          </p>
          {unresolved.length ? (
            <div className="mt-3">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-300/75">
                {allowUnresolved ? t("telegram.posts.links.pending") : t("telegram.posts.links.blocking")}
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
                {t("telegram.posts.links.ready")}
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
  post?: ManagedPostLinkTarget;
  tone: "blocking" | "pending" | "ready";
  onHighlightTarget?: (targetId: string) => void;
  onOpenPostInNewTab?: (post: ManagedPostLinkTarget) => void;
}) {
  const { t } = useI18n();
  const ready = tone === "ready";
  const status = ready ? t("telegramPosts.status.published") : postStatusLabel(t, post);
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
        <span>{post?.title || (ready ? id : t("telegram.posts.links.missingNamed", { id }))}</span>
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
        {t("telegram.posts.links.jumpHint")}
        {onOpenPostInNewTab ? ` ${t("telegram.posts.links.newTabHint")}` : ""}
      </TooltipBubble>
    </span>
  );
}
