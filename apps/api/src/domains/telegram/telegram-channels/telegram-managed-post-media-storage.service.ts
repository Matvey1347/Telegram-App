import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { B2ObjectStorageService } from '../../../common/object-storage/b2-object-storage.service';
import { telegramPostsBadRequest } from './telegram-posts.errors';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

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
