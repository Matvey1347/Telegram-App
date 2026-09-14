"use client";

import { useState } from "react";
import { LoaderCircle, Rocket, Save } from "lucide-react";
import type {
  TelegramPostBatch,
  TelegramPostBatchLifetimeHours,
} from "@telegram-system/shared";
import type { TelegramChannelSelectOption } from "@/lib/api-types/telegram/telegram-channels";
import {
  Button,
  CustomSelect,
  FormField,
  Input,
} from "@/components/ui/primitives";
import { ChannelMultiSelect } from "@/components/features/telegram/telegram/telegram-channel-multi-select";
import { useI18n } from "@/providers/i18n-provider";
import {
  applyLifetime,
  selectBatchChannels,
  updatePayload,
  validateBatch,
} from "./post-batch-model";
import { PostBatchPostCard } from "./post-batch-post-card";

const lifetimeValues = ["24", "48", "72", "permanent"] as const;

function lifetimeFromValue(value: string): TelegramPostBatchLifetimeHours {
  return value === "permanent" ? null : (Number(value) as 24 | 48 | 72);
}

export function PostBatchEditor({
  batch,
  channels,
  saving,
  dispatching,
  onSave,
  onDispatch,
}: {
  batch: TelegramPostBatch;
  channels: TelegramChannelSelectOption[];
  saving: boolean;
  dispatching: boolean;
  onSave: (batch: TelegramPostBatch) => Promise<void>;
  onDispatch: (batch: TelegramPostBatch) => Promise<void>;
}) {
  const { locale, t } = useI18n();
  const [draft, setDraft] = useState(batch);
  const [error, setError] = useState("");
  const editable = draft.status === "DRAFT";
  const busy = saving || dispatching;

  const validate = () => {
    const validation = validateBatch(draft);
    if (!validation) {
      setError("");
      return true;
    }
    setError(t(`telegram.posts.batch.validation.${validation}`));
    return false;
  };

  const save = async () => {
    if (!validate()) return;
    try {
      await onSave(draft);
      setError("");
    } catch {
      setError(t("telegram.posts.batch.saveError"));
    }
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">
            {t("telegram.posts.batch.editor")}
          </p>
          <p className="mt-1 text-sm text-neutral-300">
            {t("telegram.posts.batch.statusLabel", { status: draft.status })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!editable || busy}
            onClick={() => void save()}
          >
            {saving ? (
              <LoaderCircle size={16} className="animate-spin" />
            ) : (
              <Save size={16} />
            )}
            {saving
              ? t("telegram.posts.batch.saving")
              : t("telegram.posts.batch.saveDraft")}
          </Button>
          <Button
            type="button"
            disabled={!editable || busy}
            onClick={() => void dispatch()}
          >
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
      </div>

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

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.7fr)]">
        <FormField label={t("telegram.posts.batch.batchTitle")}>
          <Input
            value={draft.title}
            disabled={!editable || busy}
            onChange={(event) =>
              setDraft({ ...draft, title: event.target.value })
            }
          />
        </FormField>
        <FormField label={t("telegram.posts.batch.channels")}>
          <ChannelMultiSelect
            channels={channels}
            selectedIds={draft.channelIds}
            disabled={!editable || busy}
            emptySelectionLabel={t(
              "telegram.posts.batch.noChannelsSelected",
            )}
            onChange={(channelIds) =>
              setDraft(selectBatchChannels(draft, channelIds))
            }
          />
        </FormField>
      </div>

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

      <div className="space-y-3">
        {draft.posts.map((post, index) => (
          <PostBatchPostCard
            key={post.id}
            post={post}
            index={index}
            channels={channels}
            channelIds={draft.channelIds}
            disabled={!editable || busy}
            onChange={(nextPost) =>
              setDraft({
                ...draft,
                posts: draft.posts.map((item) =>
                  item.id === nextPost.id ? nextPost : item,
                ),
              })
            }
          />
        ))}
      </div>

      <span className="sr-only" data-testid="post-batch-payload-version">
        {updatePayload(draft).expectedVersion}
      </span>
    </div>
  );
}
