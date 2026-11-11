export function parseTelegramAiPostingJson(
  value: string,
): Record<string, any> | null {
  const cleaned = value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    const decoded: unknown = JSON.parse(cleaned);
    if (typeof decoded === 'string' && decoded !== cleaned)
      return parseTelegramAiPostingJson(decoded);
    if (decoded && typeof decoded === 'object' && !Array.isArray(decoded))
      return decoded as Record<string, any>;
  } catch {
    // Provider commentary around JSON is handled by the balanced scan below.
  }
  const start = cleaned.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < cleaned.length; index++) {
    const char = cleaned[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) {
      try {
        const parsed: unknown = JSON.parse(cleaned.slice(start, index + 1));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as Record<string, any>)
          : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}
