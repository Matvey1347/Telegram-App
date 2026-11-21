"use client";

import { ChevronRight, Eye, ImageIcon, MessageCircle } from "lucide-react";
import { useEffect } from "react";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import { TelegramInlineKeyboardPreview } from "./telegram-inline-keyboard-preview";
import {
  normalizeTelegramPostMediaItems,
  type TelegramPostButtonRows,
  type TelegramPostMediaItem,
} from "@telegram-system/shared";
import type { TelegramCustomEmojiPackSummary } from "@telegram-system/shared";
import { TelegramPostEngagement } from "./telegram-post-engagement";
import type { TelegramPostEngagementMetrics } from "@telegram-system/shared";
import { normalizeTelegramFormattedHtml } from "./telegram-formatted-html";
import { telegramPreviewPlainText } from "./telegram-post-preview-markup";
import { useI18n } from "@/providers/i18n-provider";
import { TelegramPostMediaPreview } from "./telegram-post-media-preview";
import { EditableTelegramPreviewText } from "./editable-telegram-preview-text";
import {
  handlePreviewContentClick,
  RenderedPreviewText,
  useRetainedCustomEmojiPacks,
} from "./telegram-post-preview-content";
export { EditableTelegramPreviewText } from "./editable-telegram-preview-text";

type TelegramPostPreviewProps = {
  channelTitle: string;
  channelPhotoUrl?: string | null;
  text: string;
  plainText?: string | null;
  formattedHtml?: string | null;
  imageUrls: string[];
  mediaItems?: TelegramPostMediaItem[];
  hasMedia?: boolean;
  engagement?:
    | TelegramPostEngagementMetrics
    | TelegramPostEngagementMetrics[]
    | null;
  onTextChange?: ((value: string) => void) | null;
  onUndo?: (() => void) | null;
  onRedo?: (() => void) | null;
  longTextMode?: "IMAGES_THEN_TEXT" | "CAPTION_THEN_TEXT";
  captionLengthMax?: number;
  messageLengthMax?: number;
  buttonRows?: TelegramPostButtonRows;
  customEmojiPacks?: TelegramCustomEmojiPackSummary[];
};
export function TelegramPostPreview({
  channelTitle,
  channelPhotoUrl,
  text,
  plainText,
  formattedHtml,
  imageUrls,
  mediaItems,
  hasMedia = false,
  engagement,
  onTextChange,
  onUndo,
  onRedo,
  longTextMode = "IMAGES_THEN_TEXT",
  captionLengthMax = 1024,
  messageLengthMax = 4096,
  buttonRows = [],
  customEmojiPacks,
}: TelegramPostPreviewProps) {
  const { ensureNamespaces, locale, t } = useI18n();
  useEffect(() => {
    void ensureNamespaces(["telegram/posts/editor"]);
  }, [ensureNamespaces]);
  const resolvedCustomEmojiPacks =
    useRetainedCustomEmojiPacks(customEmojiPacks);
  const resolvedMediaItems = normalizeTelegramPostMediaItems(
    mediaItems,
    imageUrls,
  );
  const hasContent = text.trim() || resolvedMediaItems.length || hasMedia;
  const visibleTextLength = (plainText ?? telegramPreviewPlainText(text))
    .length;
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  const messages =
    resolvedMediaItems.length && visibleTextLength > captionLengthMax
      ? longTextMode === "CAPTION_THEN_TEXT"
        ? (() => {
            const [caption, remainderText] = splitPreviewTextOnce(
              text,
              captionLengthMax,
            );
            const remainder = splitPreviewText(remainderText, messageLengthMax);
            return [
              { text: caption, mediaItems: resolvedMediaItems },
              ...remainder.map((part) => ({ text: part, mediaItems: [] })),
            ];
          })()
        : [
            { text: "", mediaItems: resolvedMediaItems },
            ...splitPreviewText(text, messageLengthMax).map((part) => ({
              text: part,
              mediaItems: [],
            })),
          ]
      : resolvedMediaItems.length
        ? [{ text, mediaItems: resolvedMediaItems }]
        : visibleTextLength > messageLengthMax
          ? splitPreviewText(text, messageLengthMax).map((part) => ({
              text: part,
              mediaItems: [],
            }))
          : [{ text, mediaItems: [] }];
  const previewEditable = Boolean(onTextChange && messages.length === 1);

  return (
    <aside className="min-w-0">
      <div className="sticky top-4 overflow-hidden rounded-xl border border-[#263849] bg-[#0e1621] shadow-xl">
        <div className="flex items-center gap-3 border-b border-[#263849] bg-[#17212b] px-4 py-3">
          <TelegramEntityAvatar
            imageUrl={channelPhotoUrl}
            kind="channel"
            alt={channelTitle}
            size="sm"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">
              {channelTitle}
            </p>
            <p className="text-xs text-[#7f91a4]">
              {t("telegram.posts.editorComponents.preview.channel")}
            </p>
          </div>
        </div>

        <div className="telegram-preview-wallpaper min-h-[460px] px-3 py-5">
          {hasContent ? (
            <div className="max-w-full space-y-2">
              {hasMedia && !resolvedMediaItems.length ? (
                <div className="flex min-h-28 items-center justify-center gap-2 rounded-[18px] rounded-bl-[5px] bg-[#182533] text-sm text-[#9fb2c3]">
                  <ImageIcon size={18} />{" "}
                  {t("telegram.posts.editorComponents.preview.mediaAttached")}
                </div>
              ) : null}
              {messages.map((message, index) => (
                <TelegramMessageBubble
                  key={index}
                  text={message.text}
                  formattedHtml={index === 0 ? formattedHtml : null}
                  mediaItems={message.mediaItems}
                  time={time}
                  editable={previewEditable && index === 0}
                  onTextChange={
                    previewEditable && index === 0
                      ? onTextChange || undefined
                      : undefined
                  }
                  onUndo={
                    previewEditable && index === 0
                      ? onUndo || undefined
                      : undefined
                  }
                  onRedo={
                    previewEditable && index === 0
                      ? onRedo || undefined
                      : undefined
                  }
                  customEmojiPacks={resolvedCustomEmojiPacks}
                />
              ))}
              <TelegramInlineKeyboardPreview
                buttonRows={buttonRows}
                customEmojiPacks={resolvedCustomEmojiPacks}
              />
              {engagement &&
              (Array.isArray(engagement) ? engagement.length : true) ? (
                <TelegramPostEngagement engagement={engagement} />
              ) : null}
            </div>
          ) : (
            <div className="flex min-h-[400px] items-center justify-center px-8 text-center text-sm text-[#708499]">
              {t("telegram.posts.editorComponents.preview.empty")}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
function TelegramMessageBubble({
  text,
  formattedHtml,
  mediaItems,
  time,
  editable = false,
  onTextChange,
  onUndo,
  onRedo,
  customEmojiPacks = [],
}: {
  text: string;
  formattedHtml?: string | null;
  mediaItems: TelegramPostMediaItem[];
  time: string;
  editable?: boolean;
  onTextChange?: (value: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  customEmojiPacks?: TelegramCustomEmojiPackSummary[];
}) {
  const { t } = useI18n();
  return (
    <div className="telegram-message-bubble overflow-hidden rounded-[18px] rounded-bl-[5px] bg-[#182533] shadow-md">
      {mediaItems.length ? (
        <TelegramPostMediaPreview mediaItems={mediaItems} />
      ) : null}
      {text.trim() ? (
        <div
          className={
            mediaItems.length ? "px-4 pb-2.5 pt-2.5" : "px-3.5 pb-2.5 pt-3"
          }
        >
          {editable && onTextChange ? (
            <EditableTelegramPreviewText
              value={text}
              formattedHtml={formattedHtml}
              customEmojiPacks={customEmojiPacks}
              onChange={onTextChange}
              onUndo={onUndo}
              onRedo={onRedo}
            />
          ) : formattedHtml &&
            !/tg-emoji|tg:\/\/emoji/i.test(`${formattedHtml}\n${text}`) ? (
            <div
              className="telegram-preview-text whitespace-pre-wrap break-words text-[14px] leading-[1.3] text-[#f5f5f5]"
              dangerouslySetInnerHTML={{
                __html: normalizeTelegramFormattedHtml(
                  formattedHtml,
                  t("telegram.posts.editorComponents.preview.copyCode"),
                ),
              }}
              onClick={handlePreviewContentClick}
            />
          ) : (
            <RenderedPreviewText
              text={text}
              customEmojiPacks={customEmojiPacks}
            />
          )}
          <MessageMeta time={time} />
        </div>
      ) : (
        <div className="px-3 py-1.5">
          <MessageMeta time={time} />
        </div>
      )}
      <div className="flex items-center justify-between border-t border-[#324557] px-3.5 py-2.5 text-[13px] text-[#40a7e3]">
        <span className="flex items-center gap-2">
          <MessageCircle size={17} />
          {t("telegram.posts.editorComponents.preview.leaveComment")}
        </span>
        <ChevronRight size={18} />
      </div>
    </div>
  );
}
function MessageMeta({ time }: { time: string }) {
  return (
    <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-[#9fb0c0]">
      <Eye size={12} />
      <span>1</span>
      <span>{time}</span>
    </div>
  );
}
function splitPreviewText(rawText: string, maxLength: number): string[] {
  const parts: string[] = [];
  let remaining = rawText.trim();
  while (remaining) {
    const [current, next] = splitPreviewTextOnce(remaining, maxLength);
    parts.push(current);
    if (!next) break;
    remaining = next;
  }
  return parts.length ? parts : [rawText];
}
function splitPreviewTextOnce(
  rawText: string,
  maxLength: number,
): [string, string] {
  if (telegramPreviewPlainText(rawText).length <= maxLength) {
    return [rawText, ""];
  }
  const boundaries = new Set<number>();
  for (const match of rawText.matchAll(/\n\s*\n/g)) {
    boundaries.add((match.index || 0) + match[0].length);
  }
  for (const match of rawText.matchAll(/[.!?…](?:["'»”)]*)\s+/g)) {
    boundaries.add((match.index || 0) + match[0].length);
  }
  for (const match of rawText.matchAll(/\n|\s+/g)) {
    boundaries.add((match.index || 0) + match[0].length);
  }
  const splitAt = [...boundaries]
    .sort((a, b) => b - a)
    .find((position) => {
      const candidate = rawText.slice(0, position).trimEnd();
      return (
        telegramPreviewPlainText(candidate).length <= maxLength &&
        hasBalancedPreviewMarkup(candidate)
      );
    });
  const fallbackAt = splitAt ?? findHardPreviewSplit(rawText, maxLength);
  if (!fallbackAt) return [rawText, ""];
  return [
    rawText.slice(0, fallbackAt).trimEnd(),
    rawText.slice(fallbackAt).trimStart(),
  ];
}
function findHardPreviewSplit(rawText: string, maxLength: number) {
  for (let position = rawText.length; position > 0; position -= 1) {
    const candidate = rawText.slice(0, position).trimEnd();
    if (
      candidate &&
      telegramPreviewPlainText(candidate).length <= maxLength &&
      hasBalancedPreviewMarkup(candidate)
    ) {
      return position;
    }
  }
  return 0;
}
function hasBalancedPreviewMarkup(value: string) {
  if ((value.match(/```/g) || []).length % 2 !== 0) return false;
  const withoutFenced = value.replace(/```[\s\S]*?```/g, "");
  if ((withoutFenced.match(/`/g) || []).length % 2 !== 0) return false;
  return ["**", "__", "++", "~~", "||"].every((marker) => {
    let count = 0;
    let cursor = 0;
    while ((cursor = withoutFenced.indexOf(marker, cursor)) !== -1) {
      count += 1;
      cursor += marker.length;
    }
    return count % 2 === 0;
  });
}
