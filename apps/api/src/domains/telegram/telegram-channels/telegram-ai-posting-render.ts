import {
  telegramHtmlToManagedMarkup,
  telegramMarkupToHtml,
} from '@api/telegram/shared/markup/telegram-markup';

export const TELEGRAM_AI_POSTING_CAPTION_LIMIT = 900;

type RenderOptions = {
  ending?: string;
  hashtags?: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderInline(source: string): string {
  const tokens: string[] = [];
  const protect = (html: string) => {
    const key = `\uE000${tokens.length}\uE001`;
    tokens.push(html);
    return key;
  };
  let value = source.replace(/<[^>]*>/g, '');
  value = value.replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_match, label: string, rawUrl: string) => {
      try {
        const url = new URL(rawUrl);
        if (!url.hostname.includes('.')) return label;
        return protect(
          `<a href="${escapeHtml(url.toString())}">${renderInline(label)}</a>`,
        );
      } catch {
        return label;
      }
    },
  );
  value = value.replace(/\*\*([^*\n]+)\*\*/g, (_match, text: string) =>
    protect(`<b>${renderInline(text)}</b>`),
  );
  value = value.replace(
    /(^|[^\w])_([^_\n]+)_($|[^\w])/g,
    (_match, before: string, text: string, after: string) =>
      `${before}${protect(`<i>${renderInline(text)}</i>`)}${after}`,
  );
  value = escapeHtml(value)
    .replace(/`+/g, '')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/(^|\s)#+\s/g, '$1')
    .replace(/(^|\s)[-*+]\s/g, '$1');
  return value.replace(
    /\uE000(\d+)\uE001/g,
    (_match, index: string) => tokens[Number(index)] ?? '',
  );
}

function renderMarkdownToHtml(input: string) {
  const lines = input.replace(/\r\n?/g, '\n').split('\n');
  const blocks: string[] = [];
  let quote: string[] = [];
  const flushQuote = () => {
    if (!quote.length) return;
    blocks.push(`<blockquote>${quote.join('\n')}</blockquote>`);
    quote = [];
  };
  for (const line of lines) {
    const match = line.match(/^\s*>\s?(.*)$/);
    if (match) {
      quote.push(renderInline(match[1]));
      continue;
    }
    flushQuote();
    if (!line.trim()) {
      if (blocks.length && blocks.at(-1) !== '') blocks.push('');
      continue;
    }
    blocks.push(renderInline(line));
  }
  flushQuote();
  return blocks
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function visibleText(markup: string) {
  return telegramMarkupToHtml(markup)
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

function visibleSuffixStart(markup: string, suffix: string) {
  if (!suffix) return -1;
  const minimum = Math.max(0, markup.length - suffix.length * 4 - 32);
  for (let index = minimum; index < markup.length; index++) {
    if (visibleText(markup.slice(index)).trimEnd() === suffix) return index;
  }
  return -1;
}

function extractHashtags(markup: string) {
  const urls = [...markup.matchAll(/https?:\/\/[^\s)\]]+/giu)].map((match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
  const matches = [
    ...markup.matchAll(/(?<![\p{L}\p{N}_])#\p{L}[\p{L}\p{N}_]*/gu),
  ];
  const hashtags: string[] = [];
  const removals: Array<{ start: number; end: number }> = [];
  for (const match of matches) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (urls.some((url) => start >= url.start && start < url.end)) continue;
    hashtags.push(match[0]);
    removals.push({ start, end });
  }
  return {
    hashtags: [...new Set(hashtags)],
    text: removals.reduceRight(
      (text, range) => text.slice(0, range.start) + text.slice(range.end),
      markup,
    ),
  };
}

export function renderTelegramAiPostingText(
  text: string,
  options: RenderOptions,
) {
  const html = renderMarkdownToHtml(text);
  let markup = telegramHtmlToManagedMarkup(html)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const ending = options.ending ?? '';
  const endingVisible = visibleText(ending).trim();
  if (endingVisible && visibleText(markup).trimEnd().endsWith(endingVisible)) {
    const duplicateStart = visibleSuffixStart(markup, endingVisible);
    if (duplicateStart >= 0) markup = markup.slice(0, duplicateStart).trimEnd();
  }
  const extracted = extractHashtags(markup);
  const hashtags = extracted.hashtags;
  markup = extracted.text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const body =
    options.hashtags === 'start' && hashtags.length
      ? [hashtags.join(' '), markup].filter(Boolean).join('\n\n')
      : markup;
  const withEnding = [body, ending].filter(Boolean).join('\n\n');
  return options.hashtags === 'end' && hashtags.length
    ? [withEnding, hashtags.join(' ')].filter(Boolean).join('\n\n')
    : withEnding;
}

export function validateTelegramAiPostingCaption(
  markup: string,
  ending: string,
  limit = TELEGRAM_AI_POSTING_CAPTION_LIMIT,
) {
  const visible = visibleText(markup).trim();
  const endingText = ending ? visibleText(ending).trim() : '';
  const endingCount = endingText ? visible.split(endingText).length - 1 : 0;
  const errors: string[] = [];
  if (!visible) errors.push('empty');
  if (visible.length > limit) errors.push('length');
  if (endingText && endingCount !== 1) errors.push('ending');
  if (/<\/?[a-z][^>]*>/i.test(markup)) errors.push('unsupported_markup');
  return { valid: errors.length === 0, errors, length: visible.length };
}

export function telegramAiPostingShortenPrompt(
  text: string,
  maxLength: number,
) {
  return `Shorten this post to no more than ${maxLength} visible characters while preserving its facts, meaning, and existing hashtags. Return JSON only: {"text":string}. Do not add a configured ending or new hashtags.\n${text}`;
}
