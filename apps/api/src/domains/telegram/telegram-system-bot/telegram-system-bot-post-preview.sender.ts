import { ConflictException } from '@nestjs/common';
import { normalizeTelegramPostMediaItems } from '@telegram-system/shared';
import { TelegramBotApiClient } from '@api/telegram/shared/bot/telegram-bot-api.client';
import {
  normalizeTelegramPostButtonRows,
  toTelegramBotInlineKeyboard,
} from '@api/telegram/shared/markup/telegram-inline-keyboard';
import { telegramMarkupToHtml } from '@api/telegram/shared/markup/telegram-markup';
import { parseTelegramHtml } from '@api/telegram/shared/markup/telegram-html-parser';
import type {
  TelegramSystemBotPostFlowScope,
  TelegramSystemBotPostPreviewDraft,
} from './telegram-system-bot-post-flow.types';

export async function sendTelegramSystemBotPostPreview(input: {
  api: TelegramBotApiClient;
  token: string;
  scope: TelegramSystemBotPostFlowScope;
  draft: TelegramSystemBotPostPreviewDraft;
}) {
  const { api, token, scope, draft } = input;
  const text = String(draft.text ?? '');
  const formattedText = telegramMarkupToHtml(text);
  // The editable source stores Custom Emoji as a descriptive Markdown token.
  // Its URL is not part of the eventual Telegram caption, so using
  // `text.length` split media and its caption even when the actual message
  // comfortably fitted into Telegram's 1,024-character Bot API limit.
  const [visibleCaptionText] = parseTelegramHtml(formattedText);
  const mediaItems = normalizeTelegramPostMediaItems(
    draft.mediaItems,
    draft.imageUrls,
  ).slice(0, 10);
  if (
    mediaItems.some((item) => item.kind === 'ANIMATION') &&
    mediaItems.length !== 1
  ) {
    throw new ConflictException(
      'An animation must be the only media item in a post',
    );
  }
  if (!text.trim() && !mediaItems.length)
    throw new ConflictException('Telegram post is empty');
  const replyMarkup = toTelegramBotInlineKeyboard(
    normalizeTelegramPostButtonRows(
      (draft.buttonRows ?? []).map((row) =>
        row.map((button) => ({
          text: String(button.text ?? '').trim(),
          url: String(button.url ?? '').trim(),
          style: button.style ?? 'default',
        })),
      ),
    ),
  ) ?? { inline_keyboard: [] };
  const messageIds: number[] = [];
  if (mediaItems.length === 1 && visibleCaptionText.length <= 1024) {
    const media = mediaItems[0];
    const method =
      media.kind === 'VIDEO'
        ? 'sendVideo'
        : media.kind === 'ANIMATION'
          ? 'sendAnimation'
          : 'sendPhoto';
    const field =
      media.kind === 'VIDEO'
        ? 'video'
        : media.kind === 'ANIMATION'
          ? 'animation'
          : 'photo';
    const commonBody = {
      chat_id: scope.chatId,
      caption: formattedText || undefined,
      parse_mode: 'HTML',
      reply_markup: replyMarkup,
    };
    if (media.kind === 'PHOTO') {
      const sent = await api.sendPhoto(token, {
        ...commonBody,
        photo: media.url,
      });
      messageIds.push(sent.message_id);
    } else {
      const sent = await api.call<{ message_id: number }>(token, method, {
        ...commonBody,
        [field]: media.url,
      });
      messageIds.push(sent.message_id);
    }
  } else {
    if (mediaItems.length) {
      const sent = await api.sendMediaGroup(token, {
        chat_id: scope.chatId,
        media: mediaItems.map((media) => ({
          type: media.kind === 'VIDEO' ? 'video' : 'photo',
          media: media.url,
        })),
      });
      messageIds.push(...sent.map((message) => message.message_id));
    }
    if (text || replyMarkup.inline_keyboard.length) {
      const sent = await api.sendMessage(token, {
        chat_id: scope.chatId,
        text: formattedText || 'Advertising post',
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      });
      messageIds.push(sent.message_id);
    }
  }
  return { status: 'SENT' as const, messageIds };
}
