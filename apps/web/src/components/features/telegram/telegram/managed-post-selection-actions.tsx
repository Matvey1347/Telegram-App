"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import type { TelegramManagedPost } from "@/lib/api";
import { useI18n } from "@/providers/i18n-provider";
import { ManagedPostExportButton } from "./managed-post-export-button";
import { ResetChannelScheduledPostsButton } from "./reset-channel-scheduled-posts-button";

export function ManagedPostSelectionActions({
  channelId,
  channelTitle,
  posts,
  busy,
  onDelete,
}: {
  channelId: string;
  channelTitle: string;
  posts: TelegramManagedPost[];
  busy: boolean;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const readOnly = posts.some((post) => post.readOnlyTelegramPost);
  const scheduled = posts.filter((post) => post.status === "SCHEDULED" && !post.readOnlyTelegramPost);
  return (
    <div className="mt-2 flex flex-wrap items-center justify-end gap-2 border-t border-neutral-800 pt-2">
      <ManagedPostExportButton posts={posts} />
      {scheduled.length > 0 && scheduled.length <= 100 && !busy ? (
        <ResetChannelScheduledPostsButton channelId={channelId} channelTitle={channelTitle} postIds={scheduled.map((post) => post.id)} />
      ) : null}
      <Button
        type="button"
        variant="danger"
        disabled={!posts.length || busy || readOnly}
        onClick={onDelete}
        title={readOnly ? t("telegram.posts.editor.syncedCannotDelete") : t("telegram.posts.editor.deleteSelectedAction")}
        aria-label={t("telegram.posts.editor.deleteSelected")}
        className="flex h-9 min-w-12 items-center justify-center px-3"
      >
        <Trash2 size={15} />
      </Button>
    </div>
  );
}
