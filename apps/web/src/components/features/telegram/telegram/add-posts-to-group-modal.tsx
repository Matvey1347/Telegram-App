"use client";

import { useState } from "react";
import type { PostGroup, TelegramManagedPost } from "@/lib/api";
import { telegramChannelsApi } from "@/lib/api";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { PostStatusIcon } from "./managed-post-presentation";
import { Button, EmptyState, Modal } from "@/components/ui/primitives";
import { Pagination } from "@/components/ui/pagination";

export function AddPostsModal({
  group,
  posts,
  pagination,
  onPageChange,
  onPageSizeChange,
  loading,
  onClose,
  onAdded,
}: {
  group?: PostGroup;
  posts: TelegramManagedPost[];
  pagination?: Omit<
    Parameters<typeof Pagination>[0],
    "onPageChange" | "onPageSizeChange" | "loading"
  >;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  loading: boolean;
  onClose: () => void;
  onAdded: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const available = posts.filter((post) => post.groupId !== group?.id);
  return (
    <Modal open onClose={onClose} title="Add posts" loading={busy}>
      <div className="space-y-3">
        {available.length ? (
          available.map((post) => (
            <label
              key={post.id}
              className="flex items-center gap-3 rounded-lg border border-neutral-800 p-3"
            >
              <input
                type="checkbox"
                checked={selected.includes(post.id)}
                onChange={() =>
                  setSelected((current) =>
                    current.includes(post.id)
                      ? current.filter((id) => id !== post.id)
                      : [...current, post.id],
                  )
                }
              />
              <IconAvatar
                icon={post.iconPresentation}
                label={post.title}
                size="xs"
              />
              <span className="min-w-0 flex-1 truncate text-sm">
                {post.title}
              </span>
              <PostStatusIcon status={post.status} />
            </label>
          ))
        ) : (
          <EmptyState text="No posts available to add." />
        )}
        {pagination ? (
          <Pagination
            {...pagination}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
            loading={loading}
          />
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!group || !selected.length || busy}
            onClick={async () => {
              if (!group) return;
              setBusy(true);
              try {
                await telegramChannelsApi.addPostsToGroup(group.id, selected);
                await onAdded();
              } finally {
                setBusy(false);
              }
            }}
          >
            Add selected
          </Button>
        </div>
      </div>
    </Modal>
  );
}


