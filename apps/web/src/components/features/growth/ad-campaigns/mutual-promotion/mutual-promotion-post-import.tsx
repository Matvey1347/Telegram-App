"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Forward } from "lucide-react";
import type { CreateMutualPromotionPostPayload } from "@telegram-system/shared";
import { telegramSystemBotApi } from "@/lib/api";
import type { TelegramSystemBotMutualPromotionPostDraft } from "@/lib/features/telegram/telegram-system-bot-api";
import {
  channelLocalDateKey,
  channelLocalTime,
  zonedDateTimeToUtc,
} from "@/lib/features/growth/telegram-ad-sales";
import { Button, FormError } from "@/components/ui/primitives";
import { useTransientActionStatus } from "@/hooks/use-transient-action-status";
import {
  MutualPromotionImportedPostCard,
  type MutualPromotionImportedPostItem,
} from "./mutual-promotion-imported-post-card";

function importedItems(
  workflowId: string,
  drafts: TelegramSystemBotMutualPromotionPostDraft[],
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
  folderId,
  timezone,
  startsAt,
  endsAt,
  botConnected,
  botUsername,
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
  previewChannelTitle: string;
  previewChannelPhotoUrl?: string | null;
  saving: boolean;
  onAddPost: (payload: CreateMutualPromotionPostPayload) => Promise<void>;
}) {
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [items, setItems] = useState<MutualPromotionImportedPostItem[]>([]);
  const [resultLoaded, setResultLoaded] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const botSend = useTransientActionStatus();

  const checkResult = useCallback(async () => {
    if (!workflowId || checking) return;
    setChecking(true);
    try {
      const result =
        await telegramSystemBotApi.mutualPromotionPostImportResult(workflowId);
      if (result.ready) {
        setResultLoaded(true);
        setItems(
          importedItems(workflowId, result.drafts, startsAt, endsAt, timezone),
        );
      }
    } catch {
      setError("Could not read the forwarded posts from the system bot.");
    } finally {
      setChecking(false);
    }
  }, [checking, endsAt, startsAt, timezone, workflowId]);

  useEffect(() => {
    if (!workflowId || resultLoaded) return;
    const onFocus = () => void checkResult();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [checkResult, resultLoaded, workflowId]);

  const prepare = async () => {
    setError(null);
    botSend.start();
    try {
      const result =
        await telegramSystemBotApi.prepareMutualPromotionPostImport(folderId);
      setWorkflowId(result.workflowId);
      setResultLoaded(false);
      setItems([]);
      botSend.sent();
      if (botUsername) {
        window.open(
          `https://t.me/${botUsername}`,
          "_blank",
          "noopener,noreferrer",
        );
      }
    } catch {
      botSend.reset();
      setError("Could not start the post import.");
    }
  };

  const addPosts = async () => {
    if (!workflowId || !items.length) return;
    const posts = items.map((item) => ({
      ...item.draft,
      scheduledAt: zonedDateTimeToUtc(
        item.date,
        item.time,
        timezone,
      ).toISOString(),
    }));
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
      await onAddPost({ importWorkflowId: workflowId, posts });
      setItems([]);
      setResultLoaded(false);
      try {
        const next =
          await telegramSystemBotApi.prepareMutualPromotionPostImport(folderId);
        setWorkflowId(next.workflowId);
      } catch {
        setWorkflowId(null);
        setError(
          "Posts were added, but the next bot import could not be prepared.",
        );
      }
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
          onClick={() => void prepare()}
          disabled={
            !botConnected || botSend.status !== "idle" || items.length > 0
          }
          aria-label={
            botSend.status === "sending"
              ? "Sending to bot"
              : botSend.status === "sent"
                ? "Sent to bot"
                : "Forward posts via bot"
          }
        >
          {botSend.status === "sending" ? (
            <span className="inline-flex min-w-[7rem] items-center justify-center">
              Sending{".".repeat(botSend.dots)}
            </span>
          ) : botSend.status === "sent" ? (
            <span className="text-emerald-100">✅ Sent to bot</span>
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
      {workflowId && !resultLoaded ? (
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
              onClick={() => void checkResult()}
              disabled={checking}
            >
              {checking ? "Checking…" : "Check forwarded posts"}
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

      {resultLoaded && !items.length ? (
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
                    (!draft.text.trim() && !draft.imageUrls.length),
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
      <FormError message={error ?? undefined} />
    </section>
  );
}
