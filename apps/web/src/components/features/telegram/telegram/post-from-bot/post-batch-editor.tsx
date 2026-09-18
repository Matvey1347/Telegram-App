"use client";

import { useEffect, useState } from "react";
import { Bot, LoaderCircle, Rocket } from "lucide-react";
import type { TelegramPostBatch } from "@telegram-system/shared";
import type { TelegramChannelNetwork } from "@/lib/api";
import type { TelegramChannelSelectOption } from "@/lib/api-types/telegram/telegram-channels";
import { Button, FormField, Input, Select } from "@/components/ui/primitives";
import { useI18n } from "@/providers/i18n-provider";
import {
  applyLifetime,
  selectBatchChannels,
  updatePayload,
  validateBatch,
} from "./post-batch-model";
import { PostBatchPostCard } from "./post-batch-post-card";
import {
  POST_BATCH_FORMAT_OPTIONS,
  postBatchFormatValue,
  postBatchLifetimeFromFormat,
} from "./post-batch-format";
import { PostBatchPublications } from "./post-batch-publications";
import {
  resolveTelegramChannelScopeIds,
  TelegramChannelScopeSelector,
  type TelegramChannelScopeMode,
} from "../telegram-channel-scope-selector";

export function PostBatchEditor({
  batch,
  initialSelectedPostId,
  channels,
  networks,
  saving,
  dispatching,
  botImportingPostId,
  botImportingAll = false,
  canImportFromBot,
  onSave,
  onDispatch,
  onAddPost,
  onImportPostFromBot,
  onImportPostsFromBot,
  onDraftChange,
}: {
  batch: TelegramPostBatch;
  initialSelectedPostId?: string | null;
  channels: TelegramChannelSelectOption[];
  networks?: TelegramChannelNetwork[];
  saving: boolean;
  dispatching: boolean;
  botImportingPostId?: string | null;
  botImportingAll?: boolean;
  canImportFromBot?: boolean;
  onSave: (batch: TelegramPostBatch) => Promise<void>;
  onDispatch: (batch: TelegramPostBatch) => Promise<void>;
  onAddPost?: (batch: TelegramPostBatch) => Promise<TelegramPostBatch>;
  onImportPostFromBot?: (postId: string, expectedVersion: number) => void;
  onImportPostsFromBot?: (postIds: string[], expectedVersion: number) => void;
  onDraftChange?: (batch: TelegramPostBatch) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(batch);
  const [sourceBatch, setSourceBatch] = useState(batch);
  const [error, setError] = useState("");
  const [selectedPostId, setSelectedPostId] = useState(
    batch.posts.some((post) => post.id === initialSelectedPostId)
      ? initialSelectedPostId!
      : (batch.posts[0]?.id ?? ""),
  );
  const [scopeMode, setScopeMode] =
    useState<TelegramChannelScopeMode>("channels");
  const [networkId, setNetworkId] = useState("");
  if (batch !== sourceBatch) {
    setSourceBatch(batch);
    setDraft(batch);
    setSelectedPostId((current) =>
      batch.posts.some((post) => post.id === current)
        ? current
        : (batch.posts[0]?.id ?? ""),
    );
  }
  const editable = draft.status === "DRAFT";
  const busy = saving || dispatching;
  const selectedPost =
    draft.posts.find((post) => post.id === selectedPostId) ?? draft.posts[0];
  const commonFormatValue = draft.posts.every(
    (post) => post.deleteAfterHours === draft.posts[0]?.deleteAfterHours,
  )
    ? postBatchFormatValue(draft.posts[0]?.deleteAfterHours ?? null)
    : "mixed";

  useEffect(() => {
    onDraftChange?.(draft);
  }, [draft, onDraftChange]);

  const validate = () => {
    const validation = validateBatch(draft);
    if (!validation) {
      setError("");
      return true;
    }
    setError(t(`telegram.posts.batch.validation.${validation}`));
    return false;
  };

  const dispatch = async () => {
    if (!validate()) return;
    try {
      await onDispatch(draft);
      setError("");
    } catch {
      setError(t("telegram.posts.batch.dispatchError"));
    }
  };

  return (
    <div className="space-y-4">
      {!editable ? (
        <p className="rounded-lg border border-amber-900/70 bg-amber-950/20 px-3 py-2 text-sm text-amber-200">
          {t("telegram.posts.batch.readOnlyAfterDispatch")}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-rose-900/70 bg-rose-950/20 px-3 py-2 text-sm text-rose-200"
        >
          {error}
        </p>
      ) : null}

      <div
        data-testid="post-batch-heading-fields"
        className="grid gap-3 md:grid-cols-[minmax(240px,0.8fr)_minmax(0,1.4fr)] md:items-end"
      >
        <div className="[&>div>span:first-child]:flex [&>div>span:first-child]:h-7 [&>div>span:first-child]:items-center">
          <FormField label={t("telegram.posts.batch.batchTitle")}>
            <Input
              value={draft.title}
              disabled={!editable || busy}
              onChange={(event) =>
                setDraft({ ...draft, title: event.target.value })
              }
            />
          </FormField>
        </div>
        <TelegramChannelScopeSelector
          mode={scopeMode}
          selectedNetworkId={networkId}
          selectedChannelIds={draft.channelIds}
          networks={networks ?? []}
          channels={channels}
          disabled={!editable || busy}
          onModeChange={setScopeMode}
          onNetworkChange={(nextNetworkId) => {
            setNetworkId(nextNetworkId);
            setDraft(
              selectBatchChannels(
                draft,
                resolveTelegramChannelScopeIds({
                  mode: "network",
                  selectedNetworkId: nextNetworkId,
                  selectedChannelIds: draft.channelIds,
                  networks: networks ?? [],
                }),
              ),
            );
          }}
          onChannelsChange={(channelIds) =>
            setDraft(selectBatchChannels(draft, channelIds))
          }
          label={t("telegram.posts.batch.channels")}
          channelsPlaceholder={t("telegram.posts.batch.noChannelsSelected")}
        />
      </div>

      <div className="grid gap-3 rounded-xl border border-neutral-800 bg-neutral-950/40 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <FormField label={t("telegram.posts.batch.formatForAll")}>
          <div data-testid="post-batch-format-for-all">
            <Select
              disabled={!editable || busy}
              value={commonFormatValue}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "mixed") return;
                setDraft(
                  applyLifetime(draft, postBatchLifetimeFromFormat(value)),
                );
              }}
            >
              <option value="mixed">
                {t("telegram.posts.batch.mixedFormat")}
              </option>
              {POST_BATCH_FORMAT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        </FormField>
        {onImportPostsFromBot ? (
          <Button
            type="button"
            variant="secondary"
            disabled={!editable || busy || !canImportFromBot || botImportingAll}
            onClick={() =>
              onImportPostsFromBot(
                draft.posts.map((post) => post.id),
                draft.version,
              )
            }
          >
            {botImportingAll ? (
              <LoaderCircle size={16} className="animate-spin" />
            ) : (
              <Bot size={16} />
            )}
            {botImportingAll
              ? t("telegram.posts.batch.waitingForBot")
              : t("telegram.posts.batch.sendPostsViaBot")}
          </Button>
        ) : null}
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <PostBatchPublications
          posts={draft.posts}
          selectedPostId={selectedPost?.id}
          editable={editable}
          busy={busy}
          onSelect={setSelectedPostId}
          onRemove={(postId) => {
            if (draft.posts.length <= 1) return;
            const removedIndex = draft.posts.findIndex(
              (post) => post.id === postId,
            );
            const posts = draft.posts
              .filter((post) => post.id !== postId)
              .map((post, position) => ({ ...post, position }));
            setDraft({
              ...draft,
              postCount: posts.length,
              posts,
            });
            if (selectedPostId === postId) {
              setSelectedPostId(
                posts[Math.min(Math.max(removedIndex, 0), posts.length - 1)]
                  ?.id ?? "",
              );
            }
          }}
          onAdd={
            onAddPost
              ? async () => {
                  try {
                    await onSave(draft);
                    const next = await onAddPost(draft);
                    setDraft(next);
                    setSelectedPostId(next.posts.at(-1)?.id ?? "");
                  } catch {
                    setError(t("telegram.posts.batch.saveError"));
                  }
                }
              : undefined
          }
        />
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          {selectedPost ? (
            <PostBatchPostCard
              key={selectedPost.id}
              post={selectedPost}
              index={draft.posts.findIndex(
                (post) => post.id === selectedPost.id,
              )}
              channels={channels}
              channelIds={draft.channelIds}
              disabled={!editable || busy}
              botImporting={botImportingPostId === selectedPost.id}
              canImportFromBot={Boolean(canImportFromBot)}
              onImportFromBot={
                onImportPostFromBot
                  ? () => onImportPostFromBot(selectedPost.id, draft.version)
                  : undefined
              }
              onChange={(nextPost) =>
                setDraft({
                  ...draft,
                  posts: draft.posts.map((item) =>
                    item.id === nextPost.id ? nextPost : item,
                  ),
                })
              }
            />
          ) : null}
        </div>
      </div>

      <span className="sr-only" data-testid="post-batch-payload-version">
        {updatePayload(draft).expectedVersion}
      </span>

      {editable ? (
        <div
          data-testid="post-batch-actions"
          className="sticky bottom-0 z-20 -mx-4 -mb-4 flex justify-end border-t border-neutral-800 bg-neutral-900/95 px-4 py-4 backdrop-blur sm:-mx-5 sm:-mb-5 sm:px-5"
        >
          <Button type="button" disabled={busy} onClick={() => void dispatch()}>
            {dispatching ? (
              <LoaderCircle size={16} className="animate-spin" />
            ) : (
              <Rocket size={16} />
            )}
            {dispatching
              ? t("telegram.posts.batch.dispatching")
              : t("telegram.posts.batch.saveAndDispatch")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
