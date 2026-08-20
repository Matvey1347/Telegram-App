import { BadRequestException } from '@nestjs/common';

const SHORT_NAME = /^[A-Za-z][A-Za-z0-9_]{0,127}$/;

/** Accepts Telegram's addemoji links/deep links or a raw sticker-set short name. */
export function normalizeTelegramCustomEmojiPackSource(source: string) {
  const raw = String(source || '').trim();
  if (!raw)
    throw new BadRequestException('Premium emoji pack source is required.');
  const url = raw.match(
    /^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/addemoji\/([A-Za-z0-9_]+)/i,
  );
  const deepLink = raw.match(/^tg:\/\/addemoji\?(.+)$/i);
  const set = deepLink ? new URLSearchParams(deepLink[1]).get('set') : null;
  const shortName = url?.[1] || set || raw;
  if (!SHORT_NAME.test(shortName)) {
    throw new BadRequestException(
      'Premium emoji pack link or short name is invalid.',
    );
  }
  return shortName;
}

export function parseTelegramCustomEmojiDocumentId(source: string) {
  const value = String(source || '').trim();
  return /^\d+$/.test(value) ? value : null;
}
