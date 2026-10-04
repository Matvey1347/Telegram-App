export function maskTelegramInviteHash(value?: string | null) {
  const hash = String(value || '')
    .trim()
    .replace(/^\+/, '');
  if (!hash) return 'n/a';
  if (hash.length <= 6) return `${hash.slice(0, 2)}***`;
  return `${hash.slice(0, 4)}***${hash.slice(-2)}`;
}

export function maskTelegramInviteUrl(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return 'n/a';
  try {
    const parsed = new URL(raw);
    const origin =
      parsed.origin === 'null' ? `${parsed.protocol}//` : `${parsed.origin}/`;
    return `${origin}[REDACTED_INVITE]`;
  } catch {
    return '[REDACTED_INVITE]';
  }
}

export function maskTelegramReferenceForLog(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return 'n/a';
  return /^(?:https?:\/\/(?:www\.)?t\.me\/(?:\+|joinchat\/)|tg:\/\/join\?invite=)/i.test(
    raw,
  )
    ? maskTelegramInviteUrl(raw)
    : raw;
}
