"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Plus, Rocket } from "lucide-react";
import type {
  TelegramPostBatch,
  TelegramPostBatchLifetimeHours,
} from "@telegram-system/shared";
import type { TelegramChannelNetwork } from "@/lib/api";
import type { TelegramChannelSelectOption } from "@/lib/api-types/telegram/telegram-channels";
import {
  Button,
  CustomSelect,
  FormField,
  Input,
} from "@/components/ui/primitives";
import { useI18n } from "@/providers/i18n-provider";
import {
  applyLifetime,
  selectBatchChannels,
  updatePayload,
  validateBatch,
} from "./post-batch-model";
import { PostBatchPostCard } from "./post-batch-post-card";
import {
  resolveTelegramChannelScopeIds,
  TelegramChannelScopeSelector,
  type TelegramChannelScopeMode,
} from "../telegram-channel-scope-selector";

const lifetimeValues = ["24", "48", "72", "permanent"] as const;

function lifetimeFromValue(value: string): TelegramPostBatchLifetimeHours {
  return value === "permanent" ? null : (Number(value) as 24 | 48 | 72);
}

export function PostBatchEditor({
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
  onAddPost?: (batch: TelegramPostBatch) => Promise<TelegramPostBatch>;
  onImportPostFromBot?: (postId: string, expectedVersion: number) => void;
  onDraftChange?: (batch: TelegramPostBatch) => void;
}) {
  const { locale, t } = useI18n();
  const [draft, setDraft] = useState(batch);
  const [error, setError] = useState("");
  const [selectedPostId, setSelectedPostId] = useState(
    batch.posts[0]?.id ?? "",
  );
  const [scopeMode, setScopeMode] =
    useState<TelegramChannelScopeMode>("channels");
  const [networkId, setNetworkId] = useState("");
  const editable = draft.status === "DRAFT";
  const busy = saving || dispatching;
  const selectedPost =
    draft.posts.find((post) => post.id === selectedPostId) ?? draft.posts[0];

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

      <FormField label={t("telegram.posts.batch.batchTitle")}>
        <Input
          value={draft.title}
          disabled={!editable || busy}
          onChange={(event) =>
            setDraft({ ...draft, title: event.target.value })
          }
        />
      </FormField>

      <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <FormField label={t("telegram.posts.batch.defaultLifetime")}>
              <CustomSelect
                uiLocale={locale}
                searchable={false}
                disabled={!editable || busy}
                value={draft.defaultDeleteAfterHours?.toString() ?? "permanent"}
                options={lifetimeValues.map((value) => ({
                  value,
                  label:
                    value === "permanent"
                      ? t("telegram.posts.batch.permanent")
                      : t(`telegram.posts.batch.lifetime${value}`),
                }))}
                onChange={(value) =>
                  setDraft({
                    ...draft,
                    defaultDeleteAfterHours: lifetimeFromValue(value),
                  })
                }
              />
            </FormField>
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={!editable || busy}
            onClick={() =>
              setDraft(applyLifetime(draft, draft.defaultDeleteAfterHours))
            }
          >
            {t("telegram.posts.batch.applyToAllPosts")}
          </Button>
        </div>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="min-w-0 rounded-xl border border-neutral-800 bg-neutral-950/45 p-2 lg:self-start">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
              {t("telegram.posts.batch.publications")}
            </span>
            <span className="text-xs text-neutral-500">
              {draft.posts.length}
            </span>
          </div>
          <div className="space-y-1">
            {draft.posts.map((post, index) => (
              <button
                key={post.id}
                type="button"
                onClick={() => setSelectedPostId(post.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left transition ${selectedPost?.id === post.id ? "border-blue-700 bg-blue-950/30" : "border-transparent hover:border-neutral-800 hover:bg-neutral-900"}`}
              >
                <span className="block truncate text-sm font-medium text-white">
                  {post.title}
                </span>
                <span className="mt-0.5 block text-xs text-neutral-500">
                  {t("telegram.posts.batch.postNumber", { number: index + 1 })}
                </span>
              </button>
            ))}
          </div>
          {editable && onAddPost ? (
            <div className="mt-2 border-t border-neutral-800 pt-2">
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={busy}
                onClick={async () => {
                  try {
                    await onSave(draft);
                    const next = await onAddPost(draft);
                    setDraft(next);
                    setSelectedPostId(next.posts.at(-1)?.id ?? "");
                  } catch {
                    setError(t("telegram.posts.batch.saveError"));
                  }
                }}
              >
                <Plus size={16} /> {t("telegram.posts.batch.addPost")}
              </Button>
            </div>
          ) : null}
        </aside>
        <div className="min-w-0">
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
        <div className="sticky bottom-0 z-20 flex justify-end border-t border-neutral-800 bg-neutral-900/95 py-4 backdrop-blur">
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
