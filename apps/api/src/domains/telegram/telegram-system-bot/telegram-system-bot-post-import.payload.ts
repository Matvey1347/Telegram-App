import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  TelegramSystemBotPostDraft,
  TelegramSystemBotPostImportMode,
} from '@telegram-system/shared';
import { telegramSystemBotPostTitle } from './telegram-system-bot-post-flow.helpers';
import type { TelegramSystemBotCapturedPostContent } from './telegram-system-bot-post-flow.types';

export type WebsitePostImportPayload = {
  mode: TelegramSystemBotPostImportMode;
  context?: string;
  contents: TelegramSystemBotCapturedPostContent[];
};

export function parseWebsitePostImportPayload(
  value: Prisma.JsonValue,
): WebsitePostImportPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw unavailable();
  const mode = requireWebsitePostImportMode((value as { mode?: unknown }).mode);
  const rawContext = (value as { context?: unknown }).context;
  const context =
    typeof rawContext === 'string' && rawContext.trim()
      ? rawContext.trim().slice(0, 120)
      : undefined;
  const rawContents = (value as { contents?: unknown }).contents;
  if (!Array.isArray(rawContents)) return { mode, context, contents: [] };
  if (!rawContents.every(isCapturedPostContent)) throw unavailable();
  return { mode, context, contents: rawContents };
}

export function requireWebsitePostImportMode(
  value: unknown,
): TelegramSystemBotPostImportMode {
  if (value !== 'single' && value !== 'multiple') throw unavailable();
  return value;
}

export function websitePostImportModeFromColumn(
  value: 'SINGLE' | 'MULTIPLE' | null,
) {
  if (value === 'SINGLE') return 'single' as const;
  if (value === 'MULTIPLE') return 'multiple' as const;
  throw unavailable();
}

export function websitePostImportJson(value: WebsitePostImportPayload) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function websitePostImportDraft(
  content: TelegramSystemBotCapturedPostContent,
): TelegramSystemBotPostDraft {
  return {
    title: telegramSystemBotPostTitle(content),
    text: content.text,
    plainText: content.plainText ?? content.text,
    ...(content.formattedHtml ? { formattedHtml: content.formattedHtml } : {}),
    imageUrls: content.imageUrls,
    mediaItems: content.mediaItems,
    buttonRows: content.buttonRows,
  };
}

function unavailable() {
  return new NotFoundException('Website post import is unavailable');
}

function isCapturedPostContent(
  value: unknown,
): value is TelegramSystemBotCapturedPostContent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const content = value as Record<string, unknown>;
  return (
    typeof content.text === 'string' &&
    Array.isArray(content.imageUrls) &&
    Array.isArray(content.buttonRows) &&
    Array.isArray(content.warnings) &&
    (content.mediaGroupId === null ||
      typeof content.mediaGroupId === 'string') &&
    (content.sourceTitle === null || typeof content.sourceTitle === 'string')
  );
}
