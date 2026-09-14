import type { Prisma } from '@prisma/client';
import {
  normalizeTelegramPostMediaItems,
  type TelegramSystemBotPostDraft,
} from '@telegram-system/shared';
import { normalizeTelegramPostButtonRows } from '../../../telegram/shared/telegram-inline-keyboard';
import {
  postBatchInvalid,
  postBatchLimitExceeded,
} from './telegram-post-batch.errors';

const MAX_MEDIA = 10;
const MAX_BUTTON_ROWS = 20;
const MAX_BUTTONS_PER_ROW = 8;
const MAX_URL_LENGTH = 2_048;

export type ImportedPostBatchContent = Omit<
  TelegramSystemBotPostDraft,
  'title'
> & {
  title?: string;
  sourceTitle?: string;
};

export function parseImportedPostBatchContents(
  value: Prisma.JsonValue,
): ImportedPostBatchContent[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const payload = value as Record<string, unknown>;
  const raw = Array.isArray(payload.contents)
    ? payload.contents
    : payload.content
      ? [payload.content]
      : [];
  return raw.map(parseImportedContent);
}

export function validatePostBatchContent(input: {
  title: unknown;
  text: unknown;
  imageUrls: unknown;
  mediaItems: unknown;
  buttonRows: unknown;
}) {
  if (
    typeof input.title !== 'string' ||
    (input.text !== null && typeof input.text !== 'string') ||
    !Array.isArray(input.imageUrls) ||
    !Array.isArray(input.mediaItems) ||
    !Array.isArray(input.buttonRows)
  ) {
    throw postBatchInvalid('Post content has an invalid shape');
  }
  if (input.title.length > 200 || (input.text?.length ?? 0) > 20_000) {
    throw postBatchLimitExceeded(
      'Post title or text exceeds the supported limit',
    );
  }
  if (
    input.imageUrls.length > MAX_MEDIA ||
    input.mediaItems.length > MAX_MEDIA ||
    normalizeTelegramPostMediaItems(input.mediaItems, input.imageUrls).length >
      MAX_MEDIA
  ) {
    throw postBatchLimitExceeded(
      'A Telegram post can contain at most 10 media items',
    );
  }
  const media = normalizeTelegramPostMediaItems(
    input.mediaItems,
    input.imageUrls,
  );
  if (
    media.some(
      (item) => item.url.length > MAX_URL_LENGTH || !isHttpUrl(item.url),
    ) ||
    input.imageUrls.some(
      (url) =>
        typeof url !== 'string' ||
        url.length > MAX_URL_LENGTH ||
        !isHttpUrl(url),
    )
  ) {
    throw postBatchInvalid('Media URLs must be valid HTTP(S) URLs');
  }
  const buttons = normalizeTelegramPostButtonRows(input.buttonRows);
  if (
    input.buttonRows.length > MAX_BUTTON_ROWS ||
    buttons.length !== input.buttonRows.length ||
    input.buttonRows.some(
      (row, index) =>
        !Array.isArray(row) ||
        row.length > MAX_BUTTONS_PER_ROW ||
        row.length !== buttons[index]?.length,
    )
  ) {
    throw postBatchLimitExceeded(
      'Inline keyboard supports at most 20 rows and 8 valid buttons per row',
    );
  }
  for (const row of buttons) {
    for (const button of row) {
      if (
        !button.text.trim() ||
        button.text.length > 64 ||
        button.url.length > MAX_URL_LENGTH ||
        !isButtonUrl(button.url)
      ) {
        throw postBatchInvalid('Inline button text or URL is invalid');
      }
    }
  }
}

function isHttpUrl(value: string) {
  return hasProtocol(value, new Set(['http:', 'https:']));
}

function isButtonUrl(value: string) {
  return hasProtocol(value, new Set(['http:', 'https:', 'tg:']));
}

function hasProtocol(value: string, allowed: Set<string>) {
  try {
    return allowed.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

function parseImportedContent(value: unknown): ImportedPostBatchContent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw postBatchInvalid('Imported post content has an invalid shape');
  }
  const item = value as Record<string, unknown>;
  if (
    (item.title !== undefined && typeof item.title !== 'string') ||
    (item.sourceTitle !== undefined && typeof item.sourceTitle !== 'string') ||
    (item.text !== undefined &&
      item.text !== null &&
      typeof item.text !== 'string') ||
    (item.imageUrls !== undefined && !Array.isArray(item.imageUrls)) ||
    (item.mediaItems !== undefined && !Array.isArray(item.mediaItems)) ||
    (item.buttonRows !== undefined && !Array.isArray(item.buttonRows))
  ) {
    throw postBatchInvalid('Imported post content has an invalid shape');
  }
  return {
    title: item.title,
    sourceTitle: item.sourceTitle,
    text: item.text ?? '',
    plainText:
      typeof item.plainText === 'string'
        ? item.plainText
        : ((item.text as string | undefined) ?? ''),
    imageUrls: (item.imageUrls as string[] | undefined) ?? [],
    mediaItems:
      (item.mediaItems as ImportedPostBatchContent['mediaItems']) ?? [],
    buttonRows:
      (item.buttonRows as ImportedPostBatchContent['buttonRows']) ?? [],
  };
}
