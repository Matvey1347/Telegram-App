"use client";

import type { TelegramSystemBotMutualPromotionPostDraft } from "@/lib/features/telegram/telegram-system-bot-api";
import { TelegramImageUpload } from "@/components/features/telegram/telegram/telegram-image-upload";
import { TelegramPostPreview } from "@/components/features/telegram/telegram/telegram-post-preview";
import { TelegramTextEditor } from "@/components/features/telegram/telegram/telegram-text-editor";
import { FormField, Input } from "@/components/ui/primitives";

export function MutualPromotionPostComposer({
  draft,
  channelTitle,
  channelPhotoUrl,
  onChange,
}: {
  draft: TelegramSystemBotMutualPromotionPostDraft;
  channelTitle: string;
  channelPhotoUrl?: string | null;
  onChange: (draft: TelegramSystemBotMutualPromotionPostDraft) => void;
}) {
  const update = (patch: Partial<TelegramSystemBotMutualPromotionPostDraft>) =>
    onChange({ ...draft, ...patch });

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(300px,0.8fr)_minmax(0,1fr)]">
      <TelegramPostPreview
        channelTitle={channelTitle}
        channelPhotoUrl={channelPhotoUrl}
        text={draft.text}
        imageUrls={draft.imageUrls}
        buttonRows={draft.buttonRows}
      />
      <div className="space-y-3">
        <FormField label="Post title" required>
          <Input
            value={draft.title}
            maxLength={160}
            onChange={(event) => update({ title: event.target.value })}
          />
        </FormField>
        <FormField label="Post text">
          <TelegramTextEditor
            value={draft.text}
            onChange={(text) => update({ text })}
            buttonRows={draft.buttonRows}
            onButtonRowsChange={(buttonRows) => update({ buttonRows })}
          />
        </FormField>
        <TelegramImageUpload
          value={draft.imageUrls}
          onChange={(imageUrls) =>
            update({ imageUrls: imageUrls.slice(0, 10) })
          }
          compact
        />
      </div>
    </div>
  );
}
