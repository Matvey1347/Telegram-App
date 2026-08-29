import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { CustomFile } from 'telegram/client/uploads';

const execFile = promisify(execFileCallback);
const maxBytes = 10 * 1024 * 1024;

export const convertTelegramPublishImageWithSips = async (
  buffer: Buffer,
  contentType: string,
) => {
  const extensions: Record<string, string> = {
    'image/avif': 'avif',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
    'image/tiff': 'tiff',
  };
  const tempDir = await mkdtemp(join(tmpdir(), 'telegram-publish-image-'));
  const inputPath = join(tempDir, `input.${extensions[contentType] || 'img'}`);
  const outputPath = join(tempDir, 'output.jpg');
  try {
    await writeFile(inputPath, buffer);
    await execFile('sips', [
      '-s',
      'format',
      'jpeg',
      inputPath,
      '--out',
      outputPath,
    ]);
    return await readFile(outputPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
};

const normalize = async (
  buffer: Buffer,
  contentType: string,
  index: number,
  convertWithSips: (buffer: Buffer, contentType: string) => Promise<Buffer>,
) => {
  if (new Set(['image/jpeg', 'image/png']).has(contentType)) {
    try {
      const { width = 0, height = 0 } = await sharp(buffer).metadata();
      const ratio =
        width > 0 && height > 0
          ? Math.max(width / height, height / width)
          : Number.POSITIVE_INFINITY;
      if (width > 0 && height > 0 && width + height <= 10_000 && ratio <= 20) {
        return { buffer, contentType };
      }
    } catch {
      /* Re-encode corrupt metadata below. */
    }
  }
  try {
    const converted = await sharp(buffer, { animated: true })
      .rotate()
      .resize({
        width: 4096,
        height: 4096,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
    if (!converted.length) throw new Error('empty_conversion');
    if (converted.length > maxBytes) throw new Error('converted_too_large');
    return { buffer: converted, contentType: 'image/jpeg' as const };
  } catch (error) {
    const converted = await convertWithSips(buffer, contentType).catch(
      () => null,
    );
    if (converted) {
      if (converted.length > maxBytes) {
        throw new Error(
          `Image ${index + 1} could not be converted for Telegram (converted image is larger than 10 MB)`,
        );
      }
      return { buffer: converted, contentType: 'image/jpeg' as const };
    }
    const reason =
      error instanceof Error && error.message === 'converted_too_large'
        ? 'converted image is larger than 10 MB'
        : 'unsupported or corrupted format';
    throw new Error(
      `Image ${index + 1} could not be converted for Telegram (${reason})`,
    );
  }
};

export const downloadTelegramPublishImage = async (
  url: string,
  index: number,
  convertWithSips = convertTelegramPublishImageWithSips,
) => {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(`Image ${index + 1} has an invalid URL`);
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error(`Image ${index + 1} must use an HTTP or HTTPS URL`);
  }
  let response: Response;
  try {
    response = await fetch(parsedUrl, { signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new Error(`Could not download image ${index + 1} before publishing`);
  }
  if (!response.ok)
    throw new Error(
      `Could not download image ${index + 1} (HTTP ${response.status})`,
    );
  const contentType = (response.headers.get('content-type') || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (!contentType.startsWith('image/'))
    throw new Error(`File ${index + 1} is not a valid image`);
  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (declaredSize > maxBytes)
    throw new Error(`Image ${index + 1} is larger than 10 MB`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error(`Image ${index + 1} is empty`);
  if (buffer.length > maxBytes)
    throw new Error(`Image ${index + 1} is larger than 10 MB`);
  const normalized = await normalize(
    buffer,
    contentType,
    index,
    convertWithSips,
  );
  const extension = normalized.contentType === 'image/png' ? 'png' : 'jpg';
  return new CustomFile(
    `telegram-post-${index + 1}.${extension}`,
    normalized.buffer.length,
    '',
    normalized.buffer,
  );
};
