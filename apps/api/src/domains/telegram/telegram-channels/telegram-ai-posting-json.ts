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

export function parseTelegramAiPostingDraft(
  reply: string,
): Record<string, unknown> | null {
  const textKeys = [
    'text', 'content', 'body', 'caption', 'postText', 'post_text',
    'publicationText', 'publication_text', 'bodyText', 'body_text', 'message',
  ];
  const unwrap = (candidate: string, depth = 0): Record<string, unknown> | null => {
    if (!candidate.trim() || depth > 3) return null;
    const parsed = parseTelegramAiPostingJson(candidate);
    if (!parsed) return null;
    const nested = parsed.draft ?? parsed.publication ?? parsed.post ?? parsed.data ?? parsed.result;
    const value = nested && typeof nested === 'object' && !Array.isArray(nested)
      ? nested as Record<string, unknown>
      : parsed;
    const firstString = (...keys: string[]) => {
      for (const key of keys) {
        const item = value[key];
        if (typeof item === 'string' && item.trim()) return item.trim();
      }
      return '';
    };
    let text = firstString(...textKeys);
    if (!text) {
      const wrappedReply = firstString('reply', 'output', 'response');
      if (wrappedReply) {
        const nestedReply = unwrap(wrappedReply, depth + 1);
        if (nestedReply) return nestedReply;
        // Some providers add another reply envelope but keep the actual copy
        // as ordinary text inside it.
        if (!/^[\s]*[\[{]/u.test(wrappedReply)) text = wrappedReply;
      }
    }
    if (!text) return null;
    const title = firstString('title', 'headline') || text
      .split(/\n+/u)
      .find((line) => line.trim())
      ?.replace(/^\s*(?:#{1,6}\s+|\*\*|_)+/u, '')
      .replace(/[\*_]+$/u, '')
      .trim()
      .slice(0, 120) || '';
    return { ...value, title, text };
  };

  const parsedDraft = unwrap(reply);
  if (parsedDraft) return parsedDraft;

  // Recover the text property from a nearly valid JSON object. The model
  // response is nested in a provider `reply` string, so an incomplete inner
  // JSON document can still arrive as a successful outer response.
  for (const key of textKeys) {
    const match = reply.match(new RegExp(`(?:"${key}"|${key})\\s*:\\s*"((?:\\\\.|[^"\\\\])*)`, 'iu'));
    if (!match?.[1]) continue;
    try {
      const text = JSON.parse(`"${match[1]}"`) as string;
      if (!text.trim()) continue;
      const titleMatch = reply.match(/(?:"title"|"headline")\s*:\s*"((?:\\.|[^"\\])*)/iu);
      let title = '';
      if (titleMatch?.[1]) {
        try { title = JSON.parse(`"${titleMatch[1]}"`) as string; } catch { /* use first line */ }
      }
      return {
        title: title.trim() || text.split(/\n+/u).find((line) => line.trim())?.trim().slice(0, 120) || '',
        text,
      };
    } catch {
      // Try other known text field names before reporting an invalid draft.
    }
  }

  // Plain prose responses remain valid; JSON-looking malformed envelopes do
  // not get published as raw markup.
  const plainText = reply.trim();
  if (!plainText || /^[\s]*[\[{`]/u.test(plainText)) return null;
  const [headline, ...body] = plainText.split(/\n\s*\n/u);
  const title = headline
    ?.replace(/^\s*(?:#{1,6}\s+|\*\*|_)+/u, '')
    .replace(/[\*_]+$/u, '')
    .trim()
    .slice(0, 120) || '';
  const text = body.join('\n\n').trim() || plainText;
  return { title, text };
}
