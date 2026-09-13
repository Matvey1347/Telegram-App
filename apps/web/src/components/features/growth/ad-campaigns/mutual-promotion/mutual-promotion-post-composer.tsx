"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
import type { TelegramSystemBotMutualPromotionPostDraft } from "@/lib/features/telegram/telegram-system-bot-api";
import {
  TelegramInlineKeyboardEditor,
  TelegramInlineKeyboardSummary,
} from "@/components/features/telegram/telegram/telegram-inline-keyboard-editor";
import { TelegramPostMediaUpload } from "@/components/features/telegram/telegram/telegram-post-media-upload";
import { TelegramPostPreview } from "@/components/features/telegram/telegram/telegram-post-preview";
import { Button, FormField, Input } from "@/components/ui/primitives";
import {
  normalizeTelegramPostMediaItems,
  telegramPostPhotoUrls,
} from "@telegram-system/shared";

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
  const [buttonsOpen, setButtonsOpen] = useState(false);
  const update = (patch: Partial<TelegramSystemBotMutualPromotionPostDraft>) =>
    onChange({ ...draft, ...patch });
  const mediaItems = normalizeTelegramPostMediaItems(
    draft.mediaItems,
    draft.imageUrls,
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(300px,0.8fr)_minmax(0,1fr)]">
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
        onTextChange={(text) =>
          update({ text, plainText: undefined, formattedHtml: undefined })
        }
      />
      <div className="space-y-3">
        <FormField label="Post title" required>
          <Input
            value={draft.title}
            maxLength={160}
            onChange={(event) => update({ title: event.target.value })}
          />
        </FormField>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3 text-sm text-neutral-300">
          Edit the post text directly in the Telegram preview. Formatting, links
          and hidden text stay visual instead of appearing as markup.
        </div>
        {draft.buttonRows.length ? (
          <TelegramInlineKeyboardSummary
            rows={draft.buttonRows}
            onEdit={() => setButtonsOpen(true)}
          />
        ) : (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setButtonsOpen(true)}
          >
            <span className="inline-flex items-center gap-1.5">
              <Link2 size={15} /> Add Telegram buttons
            </span>
          </Button>
        )}
        <TelegramInlineKeyboardEditor
          buttonRows={draft.buttonRows}
          onChange={(buttonRows) => update({ buttonRows })}
          open={buttonsOpen}
          onOpenChange={setButtonsOpen}
        />
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
