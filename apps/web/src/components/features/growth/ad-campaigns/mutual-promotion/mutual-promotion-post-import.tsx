"use client";

import { useState } from "react";
import { ExternalLink, Forward, Plus } from "lucide-react";
import {
  type CreateMutualPromotionPostPayload,
  type TelegramSystemBotPostDraft,
} from "@telegram-system/shared";
import {
  channelLocalDateKey,
  channelLocalTime,
  zonedDateTimeToUtc,
} from "@/lib/features/growth/telegram-ad-sales";
import { Button, FormError } from "@/components/ui/primitives";
import { useTelegramSystemBotPostFlow } from "@/hooks/use-telegram-system-bot-post-flow";
import {
  MutualPromotionImportedPostCard,
  type MutualPromotionImportedPostItem,
} from "./mutual-promotion-imported-post-card";

function importedItems(
  workflowId: string,
  drafts: TelegramSystemBotPostDraft[],
  startsAt: string,
  endsAt: string,
  timezone: string,
) {
  const start = Date.parse(startsAt);
  const lastAllowed = Date.parse(endsAt) - 60_000;
  return drafts.map((draft, index) => {
    const proposed = new Date(
      Math.min(start + index * 5 * 60_000, lastAllowed),
    );
    return {
      id: `${workflowId}:${index}`,
      draft,
      date: channelLocalDateKey(proposed, timezone),
      time: channelLocalTime(proposed, timezone),
    };
  });
}

export function MutualPromotionPostImport({
  timezone,
  startsAt,
  endsAt,
  botConnected,
  botUsername,
  workspaceId,
  previewChannelTitle,
  previewChannelPhotoUrl,
  saving,
  onAddPost,
}: {
  folderId: string;
  timezone: string;
  startsAt: string;
  endsAt: string;
  botConnected: boolean;
  botUsername: string | null;
  workspaceId?: string | null;
  previewChannelTitle: string;
  previewChannelPhotoUrl?: string | null;
  saving: boolean;
  onAddPost: (payload: CreateMutualPromotionPostPayload) => Promise<void>;
}) {
  const [importedWorkflowId, setImportedWorkflowId] = useState<string | null>(
    null,
  );
  const [items, setItems] = useState<MutualPromotionImportedPostItem[]>([]);
  const [hasAddedPosts, setHasAddedPosts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const botFlow = useTelegramSystemBotPostFlow({
    mode: "multiple",
    recoveryKey: "mutual-promotion-folder",
    importContext: "Mutual promotion folder",
    workspaceId,
    botUsername,
    onImported: (drafts, workflowId) => {
      setImportedWorkflowId(workflowId);
      setItems(importedItems(workflowId, drafts, startsAt, endsAt, timezone));
    },
    errorCopy: {
      read: "Could not read the forwarded posts from the system bot.",
      active:
        "Finish the current post import in the bot before starting a new one.",
      start: "Could not start the post import.",
    },
  });

  const addPosts = async () => {
    if (!importedWorkflowId || !items.length) return;
    const posts = items.map((item) => {
      const draft = item.draft;
      return {
        title: draft.title,
        text: draft.text,
        imageUrls: draft.imageUrls,
        ...(draft.mediaItems ? { mediaItems: draft.mediaItems } : {}),
        buttonRows: draft.buttonRows,
        scheduledAt: zonedDateTimeToUtc(
          item.date,
          item.time,
          timezone,
        ).toISOString(),
      };
    });
    const invalid = posts.some(({ scheduledAt }) => {
      const instant = Date.parse(scheduledAt);
      return (
        Number.isNaN(instant) ||
        instant < Date.parse(startsAt) ||
        instant >= Date.parse(endsAt)
      );
    });
    if (invalid) {
      setError(
        "Every publication time must be inside the folder activity period.",
      );
      return;
    }
    setError(null);
    try {
      await onAddPost({ importWorkflowId: importedWorkflowId, posts });
      setItems([]);
      setImportedWorkflowId(null);
      setHasAddedPosts(true);
      void botFlow.reset();
    } catch {
      setError("Could not add the imported posts to this folder.");
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold text-white">
            Forward and schedule publications
          </h4>
          <p className="mt-1 max-w-4xl text-sm text-neutral-400">
            Forward all required posts to the system bot in one batch. Finish
            the import in Telegram, then set an individual date and time for
            every post here.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => void botFlow.startImport()}
          disabled={
            !botConnected ||
            botFlow.importStatus === "working" ||
            botFlow.importStatus === "waiting" ||
            items.length > 0
          }
          aria-label={
            botFlow.importStatus === "working"
              ? "Sending to bot"
              : botFlow.importStatus === "waiting" ||
                  botFlow.importStatus === "done"
                ? "Sent to bot"
                : hasAddedPosts
                  ? "Add another post"
                  : "Forward posts via bot"
          }
        >
          {botFlow.importStatus === "working" ? (
            <span className="inline-flex min-w-[7rem] items-center justify-center">
              Sending{".".repeat(botFlow.dots)}
            </span>
          ) : botFlow.importStatus === "waiting" ? (
            <span className="text-blue-100">Waiting for bot…</span>
          ) : botFlow.importStatus === "done" ? (
            <span className="text-emerald-100">✅ Sent to bot</span>
          ) : hasAddedPosts ? (
            <>
              <Plus size={16} /> Add another post
            </>
          ) : (
            <>
              <Forward size={16} /> Forward posts via bot
            </>
          )}
        </Button>
      </div>

      {!botConnected ? (
        <p className="text-sm text-amber-300">
          Connect the workspace system bot before importing publications.
        </p>
      ) : null}
      {botFlow.workflowId ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-900/60 bg-blue-950/20 p-3 text-sm text-blue-100">
          <span>
            Forward several posts in Telegram, press “Finish import”, then
            return here.
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              className="h-8 px-2.5 text-xs"
              onClick={() => void botFlow.checkImport()}
              disabled={botFlow.importStatus === "working"}
            >
              {botFlow.importStatus === "working"
                ? "Checking…"
                : "Check forwarded posts"}
            </Button>
            {botUsername ? (
              <a
                className="inline-flex items-center gap-1 text-blue-300 hover:text-blue-200"
                href={`https://t.me/${botUsername}`}
                target="_blank"
                rel="noreferrer"
              >
                Open bot <ExternalLink size={14} />
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      {botFlow.importStatus === "done" && !items.length ? (
        <p className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3 text-sm text-neutral-400">
          No imported posts are selected. Start a new import to forward another
          batch.
        </p>
      ) : null}

      {items.length ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-emerald-200">
              Imported posts: {items.length}
            </p>
            <Button
              type="button"
              onClick={() => void addPosts()}
              disabled={
                saving ||
                items.some(
                  ({ draft }) =>
                    !draft.title.trim() ||
                    (!draft.text.trim() &&
                      !(draft.mediaItems?.length || draft.imageUrls.length)),
                )
              }
            >
              {saving ? "Adding…" : `Add ${items.length} post(s) to folder`}
            </Button>
          </div>
          {items.map((item, index) => (
            <MutualPromotionImportedPostCard
              key={item.id}
              index={index}
              item={item}
              channelTitle={previewChannelTitle}
              channelPhotoUrl={previewChannelPhotoUrl}
              onError={setError}
              onChange={(next) =>
                setItems((current) =>
                  current.map((candidate) =>
                    candidate.id === next.id ? next : candidate,
                  ),
                )
              }
              onRemove={() =>
                setItems((current) =>
                  current.filter((candidate) => candidate.id !== item.id),
                )
              }
            />
          ))}
        </div>
      ) : null}
      <FormError message={error ?? botFlow.error ?? undefined} />
    </section>
  );
}
