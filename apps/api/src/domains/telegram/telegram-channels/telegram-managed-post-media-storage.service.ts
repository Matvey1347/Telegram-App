import { Injectable } from '@nestjs/common';
import type {
  TelegramPostMediaItem,
  TelegramPostMediaKind,
} from '@telegram-system/shared';
import {
  normalizeTelegramPostMediaItems,
  telegramPostPhotoUrls,
} from '@telegram-system/shared';
import sharp from 'sharp';
import { B2ObjectStorageService } from '../../../common/object-storage/b2-object-storage.service';
import { telegramPostsBadRequest } from './telegram-posts.errors';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_TELEGRAM_POST_MEDIA_BYTES = 20 * 1024 * 1024;

@Injectable()
export class TelegramManagedPostMediaStorageService {
  constructor(private readonly storage: B2ObjectStorageService) {}

  async persistImageBytes(
    images: Array<{ bytes: Buffer; contentType?: string | null }>,
  ) {
    if (!images.length) return [];
    const normalized = await Promise.all(
      images.map((image, index) => this.normalizeImage(image.bytes, index)),
    );
    return (await this.storage.persistImmutableImages(normalized)).urls;
  }

  async persistImageUrls(imageUrls: string[]) {
    return imageUrls.map((value, index) => {
      try {
        const url = new URL(value.trim());
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
        return url.toString();
      } catch {
        throw telegramPostsBadRequest(
          'TELEGRAM_POST_MEDIA_URL_INVALID',
          `Image ${index + 1} must use a valid HTTP or HTTPS URL.`,
          { index: index + 1 },
        );
      }
    });
  }

  async persistMediaBytes(input: {
    bytes: Buffer;
    kind: TelegramPostMediaKind;
    contentType?: string | null;
    fileName?: string | null;
    width?: number | null;
    height?: number | null;
    durationSeconds?: number | null;
  }): Promise<TelegramPostMediaItem> {
    if (!input.bytes.length) {
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_MEDIA_EMPTY',
        'Media file is empty.',
      );
    }
    if (input.bytes.length > MAX_TELEGRAM_POST_MEDIA_BYTES) {
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_MEDIA_TOO_LARGE',
        'Media file is larger than 20 MB.',
        { maxMegabytes: 20 },
      );
    }
    if (input.kind === 'PHOTO') {
      const [url] = await this.persistImageBytes([
        { bytes: input.bytes, contentType: input.contentType },
      ]);
      return { ...mediaMetadata(input), kind: 'PHOTO', url };
    }
    const mimeType = detectedMotionMimeType(input.bytes, input.contentType);
    const allowed =
      input.kind === 'ANIMATION'
        ? mimeType === 'image/gif' || mimeType === 'video/mp4'
        : mimeType === 'video/mp4' || mimeType === 'video/webm';
    if (!allowed) {
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_MEDIA_INVALID',
        input.kind === 'ANIMATION'
          ? 'Animation must be a GIF or an H.264 MP4 file.'
          : 'Video must be an MP4 or WebM file.',
      );
    }
    const stored = await this.storage.persistImmutableMedia([
      { bytes: input.bytes, mimeType: mimeType! },
    ]);
    return {
      ...mediaMetadata(input),
      kind: input.kind,
      url: stored.urls[0],
      mimeType,
    };
  }

  persistMediaUrls(mediaItems: unknown, legacyImageUrls: unknown = []) {
    const normalized = normalizeTelegramPostMediaItems(
      mediaItems,
      legacyImageUrls,
    )
      .slice(0, 10)
      .map((item, index) => ({
        ...item,
        url: this.validHttpUrl(item.url, index),
      }));
    if (
      normalized.some((item) => item.kind === 'ANIMATION') &&
      normalized.length !== 1
    ) {
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_MEDIA_ALBUM_INVALID',
        'An animation must be the only media item in a post.',
      );
    }
    return {
      mediaItems: normalized,
      imageUrls: telegramPostPhotoUrls(normalized),
    };
  }

  private validHttpUrl(value: string, index: number) {
    try {
      const url = new URL(value.trim());
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      return url.toString();
    } catch {
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_MEDIA_URL_INVALID',
        `Media ${index + 1} must use a valid HTTP or HTTPS URL.`,
        { index: index + 1 },
      );
    }
  }

  private async normalizeImage(bytes: Buffer, index: number) {
    if (!bytes.length) {
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_MEDIA_EMPTY',
        `Image ${index + 1} is empty.`,
        { index: index + 1 },
      );
    }
    if (bytes.length > MAX_IMAGE_BYTES) {
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_MEDIA_TOO_LARGE',
        `Image ${index + 1} is larger than 10 MB.`,
        { index: index + 1, maxMegabytes: 10 },
      );
    }
    const mimeType = detectedImageMimeType(bytes);
    if (mimeType) return { bytes, mimeType };
    try {
      const normalized = await sharp(bytes, { animated: true })
        .rotate()
        .webp({ quality: 90 })
        .toBuffer();
      if (!normalized.length) throw new Error('empty_conversion');
      return { bytes: normalized, mimeType: 'image/webp' };
    } catch {
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_MEDIA_INVALID',
        `File ${index + 1} is not a valid image.`,
        { index: index + 1 },
      );
    }
  }
}

function mediaMetadata(input: {
  contentType?: string | null;
  fileName?: string | null;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
}) {
  return {
    ...(input.contentType ? { mimeType: input.contentType } : {}),
    ...(input.fileName ? { fileName: input.fileName } : {}),
    ...(input.width != null ? { width: input.width } : {}),
    ...(input.height != null ? { height: input.height } : {}),
    ...(input.durationSeconds != null
      ? { durationSeconds: input.durationSeconds }
      : {}),
  };
}

function detectedMotionMimeType(bytes: Buffer, hint?: string | null) {
  if (
    bytes
      .subarray(0, 6)
      .toString('ascii')
      .match(/^GIF8[79]a$/)
  )
    return 'image/gif';
  if (bytes.subarray(4, 8).toString('ascii') === 'ftyp') return 'video/mp4';
  if (bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])))
    return 'video/webm';
  const normalized = hint?.toLowerCase().split(';', 1)[0].trim();
  return normalized &&
    ['image/gif', 'video/mp4', 'video/webm'].includes(normalized)
    ? normalized
    : null;
}

function detectedImageMimeType(bytes: Buffer) {
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return 'image/jpeg';
  }
  if (
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    bytes
      .subarray(0, 6)
      .toString('ascii')
      .match(/^GIF8[79]a$/)
  ) {
    return 'image/gif';
  }
  if (
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}
