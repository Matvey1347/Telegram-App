import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { normalizeTelegramPostButtonRows } from '../../../telegram/shared/telegram-inline-keyboard';
import {
  normalizeTelegramPostMediaItems,
  telegramPostPhotoUrls,
} from '@telegram-system/shared';

export function mutualPromotionFolderTitle(value: string) {
  const title = value.trim();
  if (!title) throw new BadRequestException('Folder title is required');
  return title;
}

export function validateMutualPromotionPostTime(
  scheduledAtValue: string,
  startsAt: Date,
  endsAt: Date,
) {
  const scheduledAt = new Date(scheduledAtValue);
  if (
    !Number.isFinite(scheduledAt.getTime()) ||
    scheduledAt < startsAt ||
    scheduledAt >= endsAt
  ) {
    throw new BadRequestException('Post time must be inside [start, end)');
  }
  return scheduledAt;
}

export function mutualPromotionPostData(
  workflowPayload: Prisma.JsonValue,
  workspaceId: string,
  folderId: string,
  scheduledAt: Date,
  position: number,
  editedDraft?: {
    title: string;
    text: string;
    imageUrls: string[];
    mediaItems?: unknown[];
    buttonRows: unknown[];
  },
) {
  const payload = jsonObject(workflowPayload);
  const content = jsonObject(payload?.content);
  const normalized = mutualPromotionPostContent(
    {
      title: editedDraft?.title,
      text:
        editedDraft?.text ??
        (typeof content?.text === 'string' ? content.text : ''),
      imageUrls: editedDraft?.imageUrls ?? content?.imageUrls,
      mediaItems: editedDraft?.mediaItems ?? content?.mediaItems,
      buttonRows: editedDraft?.buttonRows ?? content?.buttonRows,
    },
    typeof content?.sourceTitle === 'string'
      ? `Forwarded from ${content.sourceTitle}`
      : `Post ${position + 1}`,
  );
  return {
    workspaceId,
    folderId,
    ...normalized,
    scheduledAt,
    position,
  };
}

export function mutualPromotionPostContent(
  draft: {
    title?: string;
    text: string;
    imageUrls: unknown;
    mediaItems?: unknown;
    buttonRows: unknown;
  },
  fallbackTitle: string,
) {
  const text = draft.text;
  const mediaItems = normalizeTelegramPostMediaItems(
    draft.mediaItems,
    draft.imageUrls,
  ).slice(0, 10);
  for (const [index, item] of mediaItems.entries()) {
    try {
      const url = new URL(item.url);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      item.url = url.toString();
    } catch {
      throw new BadRequestException(
        `Media ${index + 1} must use a valid HTTP or HTTPS URL`,
      );
    }
  }
  if (
    mediaItems.some((item) => item.kind === 'ANIMATION') &&
    mediaItems.length !== 1
  ) {
    throw new BadRequestException(
      'An animation must be the only media item in a post',
    );
  }
  const imageUrls = telegramPostPhotoUrls(mediaItems);
  if (!text.trim() && !mediaItems.length) {
    throw new BadRequestException(
      'System Bot import has no publishable text or media',
    );
  }
  const title =
    draft.title?.trim().slice(0, 160) ||
    text
      .split('\n')
      .find((line) => line.trim())
      ?.trim()
      .slice(0, 120) ||
    fallbackTitle;
  return {
    title,
    text: text || null,
    imageUrls,
    mediaItems: JSON.parse(JSON.stringify(mediaItems)) as Prisma.InputJsonValue,
    buttonRows: normalizeTelegramPostButtonRows(draft.buttonRows),
  };
}

export function mutualPromotionImportedPostCount(
  workflowPayload: Prisma.JsonValue,
) {
  const payload = jsonObject(workflowPayload);
  if (Array.isArray(payload?.contents)) return payload.contents.length;
  return jsonObject(payload?.content) ? 1 : 0;
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
