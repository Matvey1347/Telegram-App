"use client";

import type { TelegramSystemBotPostDraft } from "@telegram-system/shared";
import { TelegramPostDraftEditor } from "@/components/features/telegram/telegram/telegram-post-draft-editor";

/** Compatibility wrapper while mutual-promotion surfaces move to the canonical editor. */
export function MutualPromotionPostComposer(props: {
  draft: TelegramSystemBotPostDraft;
  channelTitle: string;
  channelPhotoUrl?: string | null;
  channelId?: string;
  onChange: (draft: TelegramSystemBotPostDraft) => void;
}) {
  return <TelegramPostDraftEditor {...props} />;
}
