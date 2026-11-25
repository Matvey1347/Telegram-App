import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse, type Font } from 'opentype.js';
import sharp from 'sharp';
import { telegramAiPostingVisibleText } from './telegram-ai-posting-render';

export function telegramAiPostingPostcardProfile(title?: string | null) {
  const name = title?.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  if (name === 'листівки привітання щодня') return 'daily';
  if (name === 'улюблені листівки') return 'loved';
  return undefined;
}

export type PostcardLettering = {
  wish: string;
  profile: NonNullable<ReturnType<typeof telegramAiPostingPostcardProfile>>;
  ordinal: number;
};

function letteringAtTop(card: PostcardLettering) {
  return card.ordinal % 2 === 0;
}

function letteringSpace(card: PostcardLettering) {
  return letteringAtTop(card) ? 'upper quarter' : 'lower quarter';
}

export function postcardArtDirection(card: PostcardLettering) {
  return card.profile === 'daily'
    ? 'Expressive, richly detailed folk or storybook imagery, with a strong focal subject. For night use a luminous moon, stars or an endearing animal against deep indigo. For mornings or daytime use vivid seasonal foliage, berries, a flower garden or a playful animal. Use ornamental gold or blue accents only when they belong to the occasion.'
    : 'Personal, intimate scenes with tangible materials and depth. For evening or night use warm lantern light against cool twilight, soft knit fabric, a sleeping animal or a quiet window. For morning or daytime use a sunlit garden, expressive florals or a lived-in seasonal still life. Use gentle colors and one clear subject; a storybook animal can be more expressive than an empty landscape.';
}

export function postcardGenerationInstruction(card: PostcardLettering) {
  return [
    'Create original full-bleed art for a Ukrainian Telegram greeting card. ' + postcardArtDirection(card),
    `Produce artwork without letters. Reserve a naturally quiet, consistently dark area in the ${letteringSpace(card)} for warm ivory lettering. Keep the main subject outside this text area. The quiet area should feel like part of the scene: shadow, dusk sky, softened foliage or an unlit wall.`,
    'Render a deliberate foreground, main subject and atmospheric depth. Show the specific occasion through tangible visual details. Keep the night motifs for night greetings only; daytime, personal thanks and named celebrations each need their own distinct subject. Include a cup only if integral to the requested scene. Omit all logos, letters, signatures, borders and watermarks.',
  ].join(' ');
}

export function postcardWish(value: string) {
  return value.replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u200D]/gu, '')
    .replace(/\s+/gu, ' ').trim();
}

export function validPostcardWish(value: string) {
  return value.length >= 5 && value.length <= 120 &&
    /[а-яіїєґ]/iu.test(value) && !/[a-zыэъё]/iu.test(value);
}

const fontPaths = ['dist/assets', 'src/assets', 'apps/api/dist/assets', 'apps/api/src/assets'];
let postcardFont: Font | undefined;

function loadPostcardFont() {
  if (postcardFont) return postcardFont;
  const fontfile = fontPaths.map((path) => resolve(path, 'postcards/Lora.ttf')).find(existsSync);
  if (!fontfile) throw new Error('AI_POSTING_POSTCARD_FONT_UNAVAILABLE');
  const bytes = Uint8Array.from(readFileSync(fontfile));
  postcardFont = parse(bytes.buffer);
  return postcardFont;
}

function wrapWish(wish: string, font: Font, maxWidth: number, size: number) {
  const lines: string[] = [];
  let line = '';
  for (const word of wish.split(/\s+/u)) {
    const next = line ? `${line} ${word}` : word;
    if (line && font.getAdvanceWidth(next, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  return [...lines, line];
}

export async function letterTelegramAiPostingPostcard(bytes: Buffer, card: PostcardLettering) {
  const { data, info: { width, height } } = await sharp(bytes, { limitInputPixels: 40_000_000 })
    .rotate().resize({ width: 1536, height: 1536, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#fff' }).toBuffer({ resolveWithObject: true });
  const font = loadPostcardFont();
  const top = letteringAtTop(card);
  const maxWidth = width * 0.84;
  const baseSize = Math.round(width * 0.08);
  const longestWord = Math.max(...card.wish.split(/\s+/u).map((word) => font.getAdvanceWidth(word, baseSize)));
  let size = Math.min(baseSize, baseSize * maxWidth / longestWord);
  let lines = wrapWish(card.wish, font, maxWidth, size);
  if (lines.length * size * 1.16 > height * 0.23) {
    size = height * 0.23 / (lines.length * 1.16);
    lines = wrapWish(card.wish, font, maxWidth, size);
  }
  const inset = height * 0.062;
  const lineHeight = size * 1.16;
  const bandHeight = Math.max(height * 0.31, lines.length * lineHeight + inset * 2);
  const baseline = top ? inset + size * 0.83 : height - inset - (lines.length - 1) * lineHeight;
  const lettering = lines.map((line, index) => {
    const left = (width - font.getAdvanceWidth(line, size)) / 2;
    return font.getPath(line, left, baseline + index * lineHeight, size).toSVG(2);
  }).join('');
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="shade" x1="0" x2="0" y1="${top ? 0 : 1}" y2="${top ? 1 : 0}"><stop stop-color="#120f16" stop-opacity=".86"/><stop offset=".63" stop-color="#120f16" stop-opacity=".66"/><stop offset="1" stop-color="#120f16" stop-opacity="0"/></linearGradient></defs><rect y="${top ? 0 : height - bandHeight}" width="${width}" height="${bandHeight}" fill="url(#shade)"/><g fill="#fff5dc">${lettering}</g></svg>`);
  return sharp(data).composite([{ input: overlay }]).jpeg({ quality: 94, chromaSubsampling: '4:4:4' }).toBuffer();
}

export function postcardLettering(title: string | null | undefined, wish: string | undefined, ordinal: number): PostcardLettering | undefined {
  const profile = telegramAiPostingPostcardProfile(title);
  return profile && wish && validPostcardWish(wish) ? { profile, wish, ordinal } : undefined;
}

export function postcardReviewInstruction(card: PostcardLettering, topic: string) {
  return [
    `Evaluate the artwork for a Ukrainian greeting card about ${topic}.`,
    `Accept only a sharp, carefully composed scene with a clear subject, coherent details and room for lettering in the ${letteringSpace(card)}. The printer will add the greeting separately.`,
    'Reject existing text, watermarks, unrelated scenes, distracting visual clutter and obvious anatomical or rendering artifacts. In candidateObservation describe the visible subject. For blank artwork explicitly return embeddedGreeting false and visibleGreeting "". If nothing qualifies, return candidateIndex 0.',
  ].join(' ');
}

export function isUnletteredPostcard(verdict: Record<string, unknown> | null) {
  return verdict?.embeddedGreeting === false && verdict.visibleGreeting === '';
}

export function readStoredPostcardLettering(
  title: string | null | undefined,
  item: { text: string; cardWish?: string; postcardOrdinal?: number; publicationIndex?: number },
  index: number,
) {
  if (!telegramAiPostingPostcardProfile(title)) return undefined;
  const firstLine = telegramAiPostingVisibleText(item.text).split(/\r?\n/u).find((line) => line.trim()) ?? '';
  return postcardLettering(title, item.cardWish ?? postcardWish(firstLine), item.postcardOrdinal ?? item.publicationIndex ?? index);
}
