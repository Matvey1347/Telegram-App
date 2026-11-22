import sharp from 'sharp';
import {
  TELEGRAM_AI_POSTING_MAX_MEDIA_REFERENCES,
  TELEGRAM_AI_POSTING_MAX_REFERENCE_IMAGE_BYTES,
} from '@telegram-system/shared';

export async function createTelegramAiPostingReferenceSheet(
  urls: string[],
  download: (url: string) => Promise<Buffer>,
) {
  const selected = urls.slice(0, TELEGRAM_AI_POSTING_MAX_MEDIA_REFERENCES);
  if (!selected.length) return null;
  const inputs = await Promise.all(selected.map(download));
  if (
    inputs.some(
      (bytes) =>
        !bytes.length || bytes.length > TELEGRAM_AI_POSTING_MAX_REFERENCE_IMAGE_BYTES,
    )
  )
    throw new Error('AI_POSTING_IMAGE_REFERENCE_INVALID');
  const columns = selected.length === 1 ? 1 : selected.length <= 4 ? 2 : 3;
  const tileSize = columns === 1 ? 1024 : 512;
  const canvasSize = tileSize * columns;
  const tiles = await Promise.all(
    inputs.map((bytes) =>
      sharp(bytes, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize(tileSize, tileSize, {
          fit: 'contain',
          background: { r: 244, g: 244, b: 244, alpha: 1 },
        })
        .jpeg({ quality: 78, mozjpeg: true })
        .toBuffer(),
    ),
  );
  const composites = tiles.map((input, index) => ({
    input,
    left: (index % columns) * tileSize,
    top: Math.floor(index / columns) * tileSize,
  }));
  return sharp({
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
