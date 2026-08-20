const MAX_OPERATIONAL_ERROR_LENGTH = 500;

const REDACTIONS: Array<[RegExp, string]> = [
  [/\b\d{5,}:[A-Za-z0-9_-]{20,}\b/g, '[REDACTED_BOT_TOKEN]'],
  [
    /https:\/\/api\.telegram\.org\/bot[^/\s]+/gi,
    'https://api.telegram.org/bot[REDACTED]',
  ],
  [/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]'],
  [
    /["'](secret|token|password|apiKey|api_key)["']\s*:\s*["'][^"']*["']/gi,
    '"$1":"[REDACTED]"',
  ],
  [/(secret|token|password|api[-_ ]?key)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]'],
];

export function sanitizeOperationalError(
  error: unknown,
  fallback = 'Operational request failed',
) {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : fallback;
  let value = raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  for (const [pattern, replacement] of REDACTIONS) {
    value = value.replace(pattern, replacement);
  }
  if (!value) value = fallback;
  return value.slice(0, MAX_OPERATIONAL_ERROR_LENGTH);
}
