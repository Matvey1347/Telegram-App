"use client";

import type { TelegramPostBatch } from "@telegram-system/shared";
import type { TelegramChannelNetwork } from "@/lib/api";
import type { TelegramChannelSelectOption } from "@/lib/api-types/telegram/telegram-channels";
import { PostBatchEditor } from "./post-batch-editor";

export function PostBatchWorkspace({
  batch,
  channels,
  networks,
  saving,
  dispatching,
  botImportingPostId,
  canImportFromBot,
  onSave,
  onDispatch,
  onAddPost,
  onImportPostFromBot,
  onDraftChange,
}: {
  batch: TelegramPostBatch;
  channels: TelegramChannelSelectOption[];
  networks?: TelegramChannelNetwork[];
  saving: boolean;
  dispatching: boolean;
  botImportingPostId?: string | null;
  canImportFromBot?: boolean;
  onSave: (batch: TelegramPostBatch) => Promise<void>;
  onDispatch: (batch: TelegramPostBatch) => Promise<void>;
  onAddPost: (batch: TelegramPostBatch) => Promise<TelegramPostBatch>;
  onImportPostFromBot?: (postId: string, expectedVersion: number) => void;
  onDraftChange?: (batch: TelegramPostBatch) => void;
}) {
  return (
    <PostBatchEditor
      batch={batch}
      channels={channels}
      networks={networks}
      saving={saving}
      dispatching={dispatching}
      botImportingPostId={botImportingPostId}
      canImportFromBot={canImportFromBot}
      onSave={onSave}
      onDispatch={onDispatch}
      onAddPost={onAddPost}
      onImportPostFromBot={onImportPostFromBot}
      onDraftChange={onDraftChange}
    />
  );
}
