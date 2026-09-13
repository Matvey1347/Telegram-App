"use client";

import type { TelegramSystemBotMutualPromotionPostDraft } from "@/lib/features/telegram/telegram-system-bot-api";
import { TelegramPostMediaUpload } from "@/components/features/telegram/telegram/telegram-post-media-upload";
import { TelegramPostPreview } from "@/components/features/telegram/telegram/telegram-post-preview";
import { TelegramTextEditor } from "@/components/features/telegram/telegram/telegram-text-editor";
import { FormField, Input } from "@/components/ui/primitives";
import {
  normalizeTelegramPostMediaItems,
  telegramPostPhotoUrls,
} from "@telegram-system/shared";

export function MutualPromotionPostComposer({
  draft,
  channelTitle,
  channelPhotoUrl,
  channelId,
  onChange,
}: {
  draft: TelegramSystemBotMutualPromotionPostDraft;
  channelTitle: string;
  channelPhotoUrl?: string | null;
  channelId?: string;
  onChange: (draft: TelegramSystemBotMutualPromotionPostDraft) => void;
}) {
  const update = (patch: Partial<TelegramSystemBotMutualPromotionPostDraft>) =>
    onChange({ ...draft, ...patch });
  const mediaItems = normalizeTelegramPostMediaItems(
    draft.mediaItems,
    draft.imageUrls,
  );

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
      <div className="w-full max-w-[340px]">
        <TelegramPostPreview
          channelTitle={channelTitle}
          channelPhotoUrl={channelPhotoUrl}
          text={draft.text}
          plainText={draft.plainText}
          formattedHtml={draft.formattedHtml}
          imageUrls={draft.imageUrls}
          mediaItems={mediaItems}
          buttonRows={draft.buttonRows}
          captionLengthMax={4_096}
          messageLengthMax={4_096}
        />
      </div>
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
            onChange={(text) =>
              update({ text, plainText: undefined, formattedHtml: undefined })
            }
            rows={12}
            channelId={channelId}
            enableCustomEmoji
            buttonRows={draft.buttonRows}
            onButtonRowsChange={(buttonRows) => update({ buttonRows })}
            placeholder="Write or edit the Telegram post…"
          />
        </FormField>
        <TelegramPostMediaUpload
          value={mediaItems}
          onChange={(nextMedia) =>
            update({
              mediaItems: nextMedia,
              imageUrls: telegramPostPhotoUrls(nextMedia),
            })
          }
          compact
        />
      </div>
    </div>
  );
}
