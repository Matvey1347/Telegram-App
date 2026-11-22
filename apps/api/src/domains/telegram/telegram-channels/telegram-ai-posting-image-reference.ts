import sharp from 'sharp';
import {
  TELEGRAM_AI_POSTING_MAX_MEDIA_REFERENCES,
  TELEGRAM_AI_POSTING_MAX_REFERENCE_IMAGE_BYTES,
} from '@telegram-system/shared';

export type TelegramAiPostingReferences = {
  image: Buffer | null;
  failed: boolean;
  grid?: { columns: number; tileSize: number; count: number };
};

export async function createTelegramAiPostingReferenceSheet(
  urls: string[],
  download: (url: string) => Promise<Buffer>,
) {
  return (await prepareTelegramAiPostingReferences(urls, download)).image;
}

export async function prepareTelegramAiPostingReferences(
  urls: string[],
  download: (url: string) => Promise<Buffer>,
): Promise<TelegramAiPostingReferences> {
  const selected = urls.slice(0, TELEGRAM_AI_POSTING_MAX_MEDIA_REFERENCES);
  if (!selected.length) return { image: null, failed: false };
  const columns = selected.length === 1 ? 1 : selected.length <= 4 ? 2 : 3;
  const tileSize = columns === 1 ? 1024 : 512;
  const canvasSize = tileSize * columns;
  const results = await Promise.allSettled(
    selected.map(async (url) => {
      const bytes = await download(url);
      if (!bytes.length || bytes.length > TELEGRAM_AI_POSTING_MAX_REFERENCE_IMAGE_BYTES)
        throw new Error('AI_POSTING_IMAGE_REFERENCE_INVALID');
      return sharp(bytes, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize(tileSize, tileSize, { fit: 'contain', background: '#f4f4f4' })
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer();
    }),
  );
  const tiles = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
  if (!tiles.length) throw new Error('AI_POSTING_IMAGE_REFERENCE_INVALID');
  const composites = tiles.map((input, index) => ({
    input,
    left: (index % columns) * tileSize,
    top: Math.floor(index / columns) * tileSize,
  }));
  const image = await sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 3,
      background: { r: 238, g: 238, b: 238 },
    },
  })
    .composite(composites)
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer();
  return { image, failed: false, grid: { columns, tileSize, count: tiles.length } };
}

export async function extractTelegramAiPostingReference(
  image: Buffer,
  grid: TelegramAiPostingReferences['grid'],
  index: unknown,
): Promise<Buffer | null> {
  if (!grid || typeof index !== 'number' || !Number.isInteger(index) || index < 1 || index > grid.count)
    return null;
  const { columns, tileSize } = grid;
  return sharp(image).extract({
    left: ((index - 1) % columns) * tileSize,
    top: Math.floor((index - 1) / columns) * tileSize,
    width: tileSize,
    height: tileSize,
  }).trim({ background: '#f4f4f4', threshold: 8 }).jpeg({ quality: 92 }).toBuffer();
}

export async function createTelegramAiPostingSearchReviewSheet(
  reference: Buffer | null,
  candidates: Buffer[],
  grid?: TelegramAiPostingReferences['grid'],
) {
  const tileSize = 320;
  const width = tileSize * 3;
  const labelHeight = 32;
  const stripHeight = candidates.length ? tileSize + labelHeight : 0;
  const label = (value: string, labelWidth: number) => Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${labelWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#222"/><text x="12" y="22" font-family="sans-serif" font-size="17" fill="#fff">${value}</text></svg>`,
  );
  const panels = (await Promise.all(candidates.map(async (bytes, index) => {
    const left = index * tileSize;
    return [
      { input: label(`CANDIDATE ${index + 1}`, tileSize), top: 0, left },
      {
        input: await sharp(bytes).rotate().resize(tileSize, tileSize, {
          fit: 'contain', background: '#e5e5e5',
        }).jpeg().toBuffer(),
        top: labelHeight,
        left,
      },
    ];
  }))).flat();
  if (reference) {
    panels.push({ input: label('REFERENCES - NOT CANDIDATES', width), top: stripHeight, left: 0 });
    panels.push({
      input: await sharp(reference).resize(width, width, { fit: 'contain', background: '#f4f4f4' }).jpeg().toBuffer(),
      top: stripHeight + labelHeight,
      left: 0,
    });
    if (grid) {
      const referenceTileSize = width / grid.columns;
      for (let index = 0; index < grid.count; index += 1) {
        panels.push({
          input: label(`REF ${index + 1}`, 75),
          top: stripHeight + labelHeight + Math.floor(index / grid.columns) * referenceTileSize,
          left: (index % grid.columns) * referenceTileSize,
        });
      }
    }
  }
  return sharp({
    create: { width, height: stripHeight + (reference ? width + labelHeight : 0), channels: 3, background: '#e5e5e5' },
  }).composite(panels).jpeg({ quality: 83 }).toBuffer();
}

export async function addTelegramAiPostingAvatarWatermark(
  imageBytes: Buffer,
  avatarBytes: Buffer,
  sizePercent = 12,
  opacityPercent = 100,
  xPercent = 100,
  yPercent = 100,
) {
  const metadata = await sharp(imageBytes).metadata();
  const width = metadata.width ?? 1024;
  const height = metadata.height ?? 1024;
  const size = Math.max(32, Math.round(Math.min(width, height) * Math.min(30, Math.max(5, sizePercent)) / 100));
  const opacity = Math.min(100, Math.max(10, opacityPercent)) / 100;
  const margin = Math.max(20, Math.round(size * 0.16));
  const avatar = await sharp(avatarBytes, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize(size, size, { fit: 'cover' })
    .png()
    .toBuffer();
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`,
  );
  const roundAvatar = await sharp(avatar)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
  const ringSize = size + 8;
  const ring = Buffer.from(
    `<svg width="${ringSize}" height="${ringSize}" xmlns="http://www.w3.org/2000/svg"><circle cx="${ringSize / 2}" cy="${ringSize / 2}" r="${size / 2 + 3}" fill="white" fill-opacity="${opacity}"/></svg>`,
  );
  const opacityMask = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white" fill-opacity="${opacity}"/></svg>`,
  );
  const fadedAvatar = await sharp(roundAvatar)
    .composite([{ input: opacityMask, blend: 'dest-in' }])
    .png()
    .toBuffer();
  const position = (dimension: number, percent: number) =>
    Math.min(margin, Math.max(0, dimension - ringSize)) +
    Math.round(Math.max(0, dimension - ringSize - 2 * margin) *
      (Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 100) / 100);
  const left = position(width, xPercent);
  const top = position(height, yPercent);
  return sharp(imageBytes)
    .composite([
      { input: ring, left, top },
      { input: fadedAvatar, left: left + 4, top: top + 4 },
    ])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}
