import { BadRequestException, Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { B2ObjectStorageService } from '../../../common/object-storage/b2-object-storage.service';

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
        throw new BadRequestException(
          `Image ${index + 1} must use a valid HTTP or HTTPS URL.`,
        );
      }
    });
  }

  private async normalizeImage(bytes: Buffer, index: number) {
    if (!bytes.length) {
      throw new BadRequestException(`Image ${index + 1} is empty.`);
    }
    if (bytes.length > MAX_IMAGE_BYTES) {
      throw new BadRequestException(`Image ${index + 1} is larger than 10 MB.`);
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
      throw new BadRequestException(`File ${index + 1} is not a valid image.`);
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
