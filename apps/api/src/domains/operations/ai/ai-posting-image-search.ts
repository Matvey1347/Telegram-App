import { aiRecord } from './ai-pricing';

export const AI_POSTING_SEARCH_MODEL = 'gpt-6-luna';
export const AI_POSTING_SEARCH_PROMPT_VERSION = 'telegram-posting-web-image-search-v1';
export const AI_POSTING_SEARCH_CALL_USD = '0.01';

export function postingImageSearchPayload(model: string, input: string, domain?: string) {
  return {
    model,
    input,
    store: false,
    reasoning: { effort: 'low' },
    max_tool_calls: 1,
    max_output_tokens: 512,
    tool_choice: 'required',
    include: ['web_search_call.results'],
    tools: [{
      type: 'web_search',
      search_content_types: ['image'],
      image_settings: { max_results: 6, caption: false },
      ...(domain ? { filters: { allowed_domains: [domain] } } : {}),
    }],
  };
}

function httpsUrl(value: unknown): URL | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

export function readPostingImageSearch(output: unknown, domain?: string) {
  const calls = Array.isArray(output) ? output.map(aiRecord).filter((item) => item.type === 'web_search_call') : [];
  const images = calls.flatMap((call) => {
    if (call.status !== 'completed' || !Array.isArray(call.results)) return [];
    return call.results.flatMap((raw) => {
      const row = aiRecord(raw);
      if (row.type !== 'image_result') return [];
      const source = httpsUrl(row.source_website_url);
      const image = httpsUrl(row.image_url);
      if (!source || !image || (domain && source.hostname !== domain && !source.hostname.endsWith(`.${domain}`))) return [];
      const pinterest = source.hostname === 'pinterest.com' || source.hostname.endsWith('.pinterest.com');
      if (pinterest && (image.hostname !== 'i.pinimg.com' || !/^\/pin\//u.test(source.pathname))) return [];
      return [{ url: image.href, sourceId: pinterest ? 'pinterest' : source.hostname.replace(/^www\./u, ''), sourceType: 'image-search' }];
    });
  });
  return { calls: calls.length, completed: calls.some((call) => call.status === 'completed'),
    images: [...new Map(images.map((image) => [image.url, image])).values()].slice(0, 6) };
}
