import sharp from 'sharp';

const MAX_REFERENCE_COUNT = 4;
const MAX_REFERENCE_BYTES = 2 * 1024 * 1024;

export async function createTelegramAiPostingReferenceSheet(
  urls: string[],
  download: (url: string) => Promise<Buffer>,
) {
  const selected = urls.slice(0, MAX_REFERENCE_COUNT);
  if (!selected.length) return null;
  const inputs = await Promise.all(selected.map(download));
  if (
    inputs.some((bytes) => !bytes.length || bytes.length > MAX_REFERENCE_BYTES)
  )
    throw new Error('AI_POSTING_IMAGE_REFERENCE_INVALID');
  const tileSize = selected.length === 1 ? 1024 : 512;
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
    left: selected.length === 1 ? 0 : (index % 2) * tileSize,
    top: selected.length === 1 ? 0 : Math.floor(index / 2) * tileSize,
  }));
  return sharp({
    create: {
      width: 1024,
      height: 1024,
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
) {
  const metadata = await sharp(imageBytes).metadata();
  const width = metadata.width ?? 1024;
  const height = metadata.height ?? 1024;
  const size = Math.max(64, Math.round(Math.min(width, height) * 0.12));
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
    `<svg width="${ringSize}" height="${ringSize}" xmlns="http://www.w3.org/2000/svg"><circle cx="${ringSize / 2}" cy="${ringSize / 2}" r="${size / 2 + 3}" fill="white"/></svg>`,
  );
  const left = Math.max(0, width - ringSize - margin);
  const top = Math.max(0, height - ringSize - margin);
  return sharp(imageBytes)
    .composite([
      { input: ring, left, top },
      { input: roundAvatar, left: left + 4, top: top + 4 },
    ])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}
