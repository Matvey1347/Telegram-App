import { BadRequestException, Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { B2ObjectStorageService } from '../../../common/object-storage/b2-object-storage.service';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

@Injectable()
export class TelegramManagedPostMediaStorageService {
  constructor(private readonly storage: B2ObjectStorageService) {}

  async persistImageUrls(imageUrls: string[]) {
    if (!imageUrls.length) return [];
    const pending = imageUrls.flatMap((url, index) =>
      isStoredTelegramPostImage(url) ? [] : [{ url, index }],
    );
    if (!pending.length) return imageUrls;

    const images = await Promise.all(
      pending.map(({ url, index }) => this.downloadImage(url, index)),
    );
    const stored = await this.storage.persistImmutableImages(images);
    const result = [...imageUrls];
    pending.forEach(({ index }, storedIndex) => {
      result[index] = stored.urls[storedIndex];
    });
    return result;
  }

  private async downloadImage(url: string, index: number) {
    const sources = remoteImageSources(url, index);
    let response: Response | null = null;
    for (const source of sources) {
      try {
        const candidate = await fetch(source, {
          headers: {
            Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*',
          },
          signal: AbortSignal.timeout(20_000),
        });
        response = candidate;
        if (candidate.ok) break;
      } catch {
        // Try the bounded fallback source before reporting the failure.
      }
    }
    if (!response?.ok) {
      throw new BadRequestException(
        response
          ? `Could not download image ${index + 1} for B2 storage (HTTP ${response.status}).`
          : `Could not download image ${index + 1} for B2 storage.`,
      );
    }
    const declaredSize = Number(response.headers.get('content-length') || 0);
    if (declaredSize > MAX_IMAGE_BYTES) {
      throw new BadRequestException(`Image ${index + 1} is larger than 10 MB.`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
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

function isStoredTelegramPostImage(value: string) {
  try {
    return new URL(value).pathname.includes('/telegram/post-images/');
  } catch {
    return false;
  }
}

function remoteImageSources(value: string, index: number) {
  let source: URL;
  try {
    source = new URL(value);
  } catch {
    throw new BadRequestException(`Image ${index + 1} has an invalid URL.`);
  }
  if (!['http:', 'https:'].includes(source.protocol)) {
    throw new BadRequestException(
      `Image ${index + 1} must use an HTTP or HTTPS URL.`,
    );
  }
  if (source.pathname.includes('/_next/image')) {
    const nestedValue = source.searchParams.get('url');
    if (nestedValue) {
      try {
        const nested = new URL(nestedValue, source);
        if (['http:', 'https:'].includes(nested.protocol)) source = nested;
      } catch {
        // The original URL below still produces a useful validation error.
      }
    }
  }
  const sources = [source];
  if (source.hostname === 'assets.st-note.com' && !source.searchParams.size) {
    const resized = new URL(source);
    resized.searchParams.set('width', '1200');
    sources.push(resized);
  }
  const fallback = new URL('https://wsrv.nl/');
  fallback.searchParams.set(
    'url',
    sources.at(-1)?.toString() ?? source.toString(),
  );
  fallback.searchParams.set('output', 'webp');
  return [...sources, fallback];
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
