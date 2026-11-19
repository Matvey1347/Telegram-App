import { createHash } from 'crypto';
import sharp from 'sharp';

/** Hash the actual rendered pixels, not a mutable Telegram URL or file reference. */
export async function channelAvatarEmojiImage(bytes: Buffer) {
  const square = await sharp(bytes, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize(100, 100, { fit: 'cover', position: 'centre' })
    .ensureAlpha()
    .png()
    .toBuffer();
  const png = await sharp(square)
    .composite([
      {
        input: Buffer.from(
          '<svg width="100" height="100"><circle cx="50" cy="50" r="50" fill="white"/></svg>',
        ),
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer();
  return {
    png,
    hash: createHash('sha256').update(png).digest('hex'),
    imageUrl: `data:image/png;base64,${png.toString('base64')}`,
  };
}

/** Telegram converts PNG to WebP; compare pixels only for remote-operation reconciliation. */
async function avatarPixels(bytes: Buffer) {
  const { data, info } = await sharp(bytes, { limitInputPixels: 40_000_000 })
    .toColourspace('srgb')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== 100 || info.height !== 100 || info.channels !== 4)
    throw new Error('Expected a 100x100 avatar document.');
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] === 0) data.fill(0, offset, offset + 3);
  }
  return data;
}

/** Never used as source deduplication: source versions still use their exact PNG SHA-256. */
export async function channelAvatarEmojiImagesMatch(
  expected: Buffer,
  document: Buffer,
) {
  const [source, actual] = await Promise.all([
    avatarPixels(expected),
    avatarPixels(document),
  ]);
  let absolute = 0;
  let squared = 0;
  let samples = 0;
  for (let offset = 0; offset < source.length; offset += 4) {
    if (source[offset + 3] !== actual[offset + 3]) return false;
    if (!source[offset + 3]) continue;
    for (let channel = 0; channel < 3; channel++) {
      const difference = source[offset + channel] - actual[offset + channel];
      absolute += Math.abs(difference);
      squared += difference * difference;
      samples++;
    }
  }
  return (
    samples > 0 && absolute / samples <= 4 && Math.sqrt(squared / samples) <= 8
  );
}
