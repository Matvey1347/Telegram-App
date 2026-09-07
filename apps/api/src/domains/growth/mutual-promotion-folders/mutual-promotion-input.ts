import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { normalizeTelegramPostButtonRows } from '../../../telegram/shared/telegram-inline-keyboard';

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
    buttonRows: unknown;
  },
  fallbackTitle: string,
) {
  const text = draft.text;
  const rawImageUrls = draft.imageUrls;
  const imageUrls = Array.isArray(rawImageUrls)
    ? rawImageUrls
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 10)
    : [];
  if (!text.trim() && !imageUrls.length) {
    throw new BadRequestException(
      'System Bot import has no publishable text or images',
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
