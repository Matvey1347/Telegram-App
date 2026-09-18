"use client";

import { useEffect, useState } from "react";
import { CalendarClock, ChevronDown, Trash2 } from "lucide-react";
import type { TelegramSystemBotPostDraft } from "@telegram-system/shared";
import {
  Button,
  DateInput,
  FormField,
  TimeInput,
} from "@/components/ui/primitives";
import { useTelegramSystemBotPostFlow } from "@/hooks/use-telegram-system-bot-post-flow";
import { MutualPromotionPostComposer } from "./mutual-promotion-post-composer";

export type MutualPromotionImportedPostItem = {
  id: string;
  draft: TelegramSystemBotPostDraft;
  date: string;
  time: string;
};

export function MutualPromotionImportedPostCard({
  index,
  item,
  channelTitle,
  channelPhotoUrl,
  onChange,
  onRemove,
  onError,
}: {
  index: number;
  item: MutualPromotionImportedPostItem;
  channelTitle: string;
  channelPhotoUrl?: string | null;
  onChange: (item: MutualPromotionImportedPostItem) => void;
  onRemove: () => void;
  onError: (message: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const previewFlow = useTelegramSystemBotPostFlow({
    mode: "single",
    previewDraft: item.draft,
    errorCopy: {
      preview: "Could not send the current post preview to the system bot.",
    },
  });
  useEffect(() => {
    onError(previewFlow.error || null);
  }, [onError, previewFlow.error]);

  return (
    <article className="overflow-hidden rounded-xl border border-emerald-900/70 bg-emerald-950/20">
      <div className="flex items-center gap-3 p-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <ChevronDown
            size={18}
            className={`shrink-0 text-neutral-400 transition-transform ${expanded ? "" : "-rotate-90"}`}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-white">
              {index + 1}. {item.draft.title || "Imported post"}
            </span>
            <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-neutral-400">
              <CalendarClock size={13} /> {item.date} · {item.time}
            </span>
          </span>
        </button>
        <Button
          type="button"
          variant="danger"
          className="h-8 !px-2.5"
          aria-label={`Remove post ${index + 1}`}
          onClick={onRemove}
        >
          <Trash2 size={15} />
        </Button>
      </div>

      {expanded ? (
        <div className="space-y-4 border-t border-emerald-900/50 p-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
            <FormField label="Publication date" required>
              <DateInput
                value={item.date}
                onChange={(event) =>
                  onChange({ ...item, date: event.target.value })
                }
              />
            </FormField>
            <FormField label="Time" required>
              <TimeInput
                value={item.time}
                onChange={(event) =>
                  onChange({ ...item, time: event.target.value })
                }
              />
            </FormField>
          </div>
          <MutualPromotionPostComposer
            draft={item.draft}
            channelTitle={channelTitle}
            channelPhotoUrl={channelPhotoUrl}
            onChange={(draft) => onChange({ ...item, draft })}
          />
          <div className="flex justify-end border-t border-emerald-900/50 pt-3">
            <Button
              type="button"
              variant="secondary"
              disabled={previewFlow.sendStatus === "working"}
              aria-label={
                previewFlow.sendStatus === "working"
                  ? `Sending post ${index + 1} to bot`
                  : previewFlow.sendStatus === "done"
                    ? `Post ${index + 1} sent to bot`
                    : `Send post ${index + 1} to bot`
              }
              onClick={() => void previewFlow.send()}
            >
              {previewFlow.sendStatus === "working"
                ? "Sending…"
                : previewFlow.sendStatus === "done"
                  ? "✅ Sent to bot"
                  : "Send current post to bot"}
            </Button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
