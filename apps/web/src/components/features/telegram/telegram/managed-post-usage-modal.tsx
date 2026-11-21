"use client";

import { type TelegramManagedPost } from "@/lib/api";
import { Button, EmptyState, Modal } from "@/components/ui/primitives";
import { useI18n } from "@/providers/i18n-provider";
import {
  PostIcon,
  managedPostStatusKey,
  wantsNewTab,
} from "./managed-post-identity";

export function PostUsageModal({
  post,
  usages,
  onClose,
  onOpenPost,
  onOpenPostInNewTab,
}: {
  post: TelegramManagedPost;
  usages: TelegramManagedPost[];
  onClose: () => void;
  onOpenPost: (post: TelegramManagedPost) => void;
  onOpenPostInNewTab: (post: TelegramManagedPost) => void;
}) {
  const { t } = useI18n();
  return (
    <Modal
      open
      onClose={onClose}
      title={t("telegram.posts.groups.usedInPosts")}
      allowOverflow
    >
      <div className="space-y-3">
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2">
          <div className="flex items-center gap-2">
            {post.icon ? (
              <PostIcon
                iconId={post.icon}
                icon={post.iconPresentation}
                label={post.title}
              />
            ) : null}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">
                {post.title}
              </p>
              <p className="text-xs text-neutral-400">
                {usages.length
                  ? t("telegram.posts.groups.usedCount", {
                      count: usages.length,
                    })
                  : t("telegram.posts.groups.notUsed")}
              </p>
            </div>
          </div>
        </div>
        {usages.length ? (
          <div className="space-y-1.5">
            {usages.map((usagePost) => (
              <button
                key={usagePost.id}
                type="button"
                onClick={(event) => {
                  if (wantsNewTab(event)) {
                    onOpenPostInNewTab(usagePost);
                    return;
                  }
                  onOpenPost(usagePost);
                }}
                className="flex w-full items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-left transition hover:border-blue-700 hover:bg-blue-950/20"
              >
                {usagePost.icon ? (
                  <PostIcon
                    iconId={usagePost.icon}
                    icon={usagePost.iconPresentation}
                    label={usagePost.title}
                  />
                ) : (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900 text-sm">
                    📝
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">
                    {usagePost.title}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {t(managedPostStatusKey(usagePost.status))}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-blue-300">
                  {t("common.open")}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState text={t("telegram.posts.groups.notLinked")} />
        )}
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
