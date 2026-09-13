"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type {
  MutualPromotionFolderPost,
  UpdateMutualPromotionPostPayload,
} from "@telegram-system/shared";
import { normalizeTelegramPostMediaItems } from "@telegram-system/shared";
import { formatDateTime } from "@/lib/date-format";
import {
  channelLocalDateKey,
  channelLocalTime,
  zonedDateTimeToUtc,
} from "@/lib/features/growth/telegram-ad-sales";
import {
  Button,
  DateInput,
  FormError,
  FormField,
  TimeInput,
} from "@/components/ui/primitives";
import { MutualPromotionPostComposer } from "./mutual-promotion-post-composer";
import type { TelegramSystemBotMutualPromotionPostDraft } from "@/lib/features/telegram/telegram-system-bot-api";

export function MutualPromotionSavedPostCard({
  post,
  index,
  editable,
  timezone,
  startsAt,
  endsAt,
  channelTitle,
  channelPhotoUrl,
  saving,
  onSave,
  onRemove,
}: {
  post: MutualPromotionFolderPost;
  index: number;
  editable: boolean;
  timezone: string;
  startsAt: string;
  endsAt: string;
  channelTitle: string;
  channelPhotoUrl?: string | null;
  saving: boolean;
  onSave: (
    postId: string,
    payload: UpdateMutualPromotionPostPayload,
  ) => Promise<void>;
  onRemove: (postId: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [draft, setDraft] = useState<TelegramSystemBotMutualPromotionPostDraft>(
    () => postDraft(post),
  );
  const [error, setError] = useState<string | null>(null);

  const beginEditing = () => {
    setDraft(postDraft(post));
    setDate(channelLocalDateKey(post.scheduledAt, timezone));
    setTime(channelLocalTime(post.scheduledAt, timezone));
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    const scheduledAt = zonedDateTimeToUtc(date, time, timezone);
    const instant = scheduledAt.getTime();
    if (
      Number.isNaN(instant) ||
      instant < Date.parse(startsAt) ||
      instant >= Date.parse(endsAt)
    ) {
      setError(
        "The publication time must be inside the folder activity period.",
      );
      return;
    }
    if (
      !draft.title.trim() ||
      (!draft.text.trim() &&
        !(draft.mediaItems?.length || draft.imageUrls.length))
    ) {
      setError("Add a title and publishable text or an image.");
      return;
    }
    setError(null);
    try {
      await onSave(post.id, {
        ...draft,
        scheduledAt: scheduledAt.toISOString(),
      });
      setEditing(false);
    } catch {
      setError("Could not update the publication.");
    }
  };

  return (
    <article className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950/40">
      <div className="flex items-center justify-between gap-3 p-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-white">
            {index + 1}. {post.title || "Imported publication"}
          </p>
          <p className="mt-1 text-sm text-neutral-400">
            {formatDateTime(post.scheduledAt)}
          </p>
        </div>
        {editable ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              className="h-8 !px-2.5"
              aria-label={`Edit publication ${index + 1}`}
              onClick={beginEditing}
              disabled={saving || editing}
            >
              <Pencil size={16} />
            </Button>
            <Button
              type="button"
              variant="danger"
              className="h-8 !px-2.5"
              aria-label={`Remove publication ${index + 1}`}
              onClick={() => void onRemove(post.id).catch(() => undefined)}
              disabled={saving}
            >
              <Trash2 size={16} />
            </Button>
          </div>
        ) : null}
      </div>

      {editing ? (
        <div className="space-y-4 border-t border-neutral-800 p-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
            <FormField label="Publication date" required>
              <DateInput
                aria-label="Publication date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </FormField>
            <FormField label="Time" required>
              <TimeInput
                aria-label="Time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
              />
            </FormField>
          </div>
          <MutualPromotionPostComposer
            draft={draft}
            channelTitle={channelTitle}
            channelPhotoUrl={channelPhotoUrl}
            onChange={setDraft}
          />
          <FormError message={error ?? undefined} />
          <div className="flex justify-end gap-2 border-t border-neutral-800 pt-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save publication"}
            </Button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function postDraft(post: MutualPromotionFolderPost) {
  return {
    title: post.title,
    text: post.text ?? "",
    imageUrls: post.imageUrls,
    mediaItems: normalizeTelegramPostMediaItems(
      post.mediaItems,
      post.imageUrls,
    ),
    buttonRows: post.buttonRows,
  };
}
