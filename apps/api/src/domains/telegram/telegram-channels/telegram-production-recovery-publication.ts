import { BadRequestException } from '@nestjs/common';
import { normalizeTelegramPostMediaItems } from '@telegram-system/shared';

export class RecoveryRequestError extends BadRequestException {}

export function productionRecoveryPublicationData(
  value: Record<string, unknown> | undefined,
  imageUrls: string[],
  mediaItems: unknown,
) {
  const keys = new Set([
    'html',
    'textHtmlParts',
    'captionHtml',
    'followupHtmlParts',
    'imageUrls',
    'mediaItems',
  ]);
  if (!value || Object.keys(value).some((key) => !keys.has(key)))
    throw new RecoveryRequestError('Invalid recovery publication payload');
  const validText = (text: unknown) =>
    typeof text === 'string' && text.length <= 100_000;
  const validParts = (parts: unknown) =>
    parts === undefined ||
    (Array.isArray(parts) && parts.length <= 100 && parts.every(validText));
  if (
    !validText(value.html) ||
    (value.captionHtml !== undefined && !validText(value.captionHtml)) ||
    !validParts(value.textHtmlParts) ||
    !validParts(value.followupHtmlParts) ||
    !Array.isArray(value.imageUrls) ||
    value.imageUrls.length > 100 ||
    value.imageUrls.some(
      (url) => typeof url !== 'string' || url.length > 8192,
    ) ||
    JSON.stringify(value.imageUrls) !== JSON.stringify(imageUrls)
  )
    throw new RecoveryRequestError(
      'Invalid recovery publication text or stored media',
    );
  const expected = normalizeTelegramPostMediaItems(mediaItems, imageUrls);
  if (
    value.mediaItems !== undefined &&
    (!Array.isArray(value.mediaItems) ||
      value.mediaItems.length > 100 ||
      JSON.stringify(value.mediaItems) !== JSON.stringify(expected))
  )
    throw new RecoveryRequestError('Recovery media must match the stored post');
  return {
    html: value.html as string,
    captionHtml: value.captionHtml as string | undefined,
    textHtmlParts: value.textHtmlParts as string[] | undefined,
    followupHtmlParts: value.followupHtmlParts as string[] | undefined,
    imageUrls,
    mediaItems: expected,
  };
}
