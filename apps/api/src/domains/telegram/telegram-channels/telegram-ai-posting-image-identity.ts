import { createHash } from 'node:crypto';
import sharp from 'sharp';

export async function telegramAiPostingImageIdentity(bytes: Buffer) {
  const { data } = await sharp(bytes, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize(9, 8, { fit: 'fill' })
    .toColourspace('srgb')
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let difference = 0n;
  const totals = [0, 0, 0];
  for (let pixel = 0; pixel < 72; pixel++) {
    const offset = pixel * 3;
    for (let channel = 0; channel < 3; channel++) {
      totals[channel] += data[offset + channel];
    }
    if (pixel % 9 < 8) {
      const luminance = (i: number) =>
        data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114;
      difference = (difference << 1n) | BigInt(luminance(offset) > luminance(offset + 3));
    }
  }
  const color = totals.map((sum) => Math.round(sum / 72).toString(16).padStart(2, '0')).join('');
  return {
    fingerprint: createHash('sha256').update(bytes).digest('hex'),
    visualFingerprint: `visual:${difference.toString(16).padStart(16, '0')}:${color}`,
  };
}

export function hasTelegramAiPostingImage(
  used: ReadonlySet<string>,
  identity: Awaited<ReturnType<typeof telegramAiPostingImageIdentity>>,
) {
  if (used.has(identity.fingerprint) || used.has(identity.visualFingerprint)) return true;
  const [, signature, color] = identity.visualFingerprint.split(':');
  for (const entry of used) {
    const prior = /^visual:([a-f0-9]{16}):([a-f0-9]{6})$/u.exec(entry);
    if (!prior) continue;
    const similarColor = [0, 2, 4].every((offset) =>
      Math.abs(parseInt(color.slice(offset, offset + 2), 16) - parseInt(prior[2].slice(offset, offset + 2), 16)) <= 14,
    );
    if (!similarColor) continue;
    let differences = BigInt(`0x${signature}`) ^ BigInt(`0x${prior[1]}`);
    for (let bit = 0; bit < 6 && differences; bit++) differences &= differences - 1n;
    if (differences === 0n) return true;
  }
  return false;
}


/** Stable catalog image identity across the original and resized URLs. */
export function telegramAiPostingImageUrlKey(value: string) {
  try {
    const url = new URL(value);
    if (url.hostname === 'upload.wikimedia.org') {
      const path = url.pathname.replace('/thumb/', '/').replace(/\/[^/]+px-[^/]+$/u, '');
      return `catalog-image:${url.hostname}${path}`;
    }
    if (url.hostname === 'i.pinimg.com') {
      return `catalog-image:${url.hostname}${url.pathname.replace(/^\/[^/]+/u, '')}`;
    }
  } catch {
    return value;
  }
  return value;
}

/** No await between checking the chosen image and reserving it for this batch. */
export function claimTelegramAiPostingImage(
  claims: Set<string> | undefined,
  identity: Awaited<ReturnType<typeof telegramAiPostingImageIdentity>>,
  url?: string,
) {
  if (!claims) return true;
  const urlKey = url ? telegramAiPostingImageUrlKey(url) : undefined;
  if ((urlKey && claims.has(urlKey)) || hasTelegramAiPostingImage(claims, identity))
    return false;
  if (urlKey) claims.add(urlKey);
  claims.add(identity.fingerprint);
  claims.add(identity.visualFingerprint);
  return true;
}
