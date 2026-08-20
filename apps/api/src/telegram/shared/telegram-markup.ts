import { parseTelegramSpoilers } from './telegram-spoilers';
import { parseTelegramCustomEmojiTokens } from './telegram-custom-emoji-markup';
import { parseTelegramTableCellMarkup } from '@telegram-system/shared/telegram-table-markup';

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function parseFencedCodeBlock(info: string, lineBreak: string, code: string) {
  const normalizedInfo = info.replace(/\r/g, '');
  const normalizedLineBreak = lineBreak.replace(/\r/g, '\n');
  const normalizedCode = code.replace(/\r/g, '\n');
  const language = normalizedInfo.trim();
  const hasLanguage = language.length > 0;
  return {
    language: hasLanguage ? language : '',
    code: hasLanguage
      ? normalizedCode
      : normalizedInfo
        ? `${normalizedInfo}${normalizedLineBreak}${normalizedCode}`
        : normalizedCode,
  };
}

function convertBlockquotes(value: string) {
  const lines = value.split('\n');
  const output: string[] = [];
  let quoteType: 'regular' | 'expandable' | null = null;
  let quoteLines: string[] = [];

  const flush = () => {
    if (!quoteType) return;
    const attribute = quoteType === 'expandable' ? ' expandable' : '';
    output.push(
      `<blockquote${attribute}>${quoteLines.join('\n')}</blockquote>`,
    );
    quoteType = null;
    quoteLines = [];
  };

  for (const line of lines) {
    const expandable = line.match(/^&gt;&gt;\s?(.*)$/);
    const regular = line.match(/^&gt;\s?(.*)$/);
    const nextType = expandable ? 'expandable' : regular ? 'regular' : null;
    if (!nextType) {
      flush();
      output.push(line);
      continue;
    }
    if (quoteType && quoteType !== nextType) flush();
    quoteType = nextType;
    quoteLines.push((expandable || regular)?.[1] || '');
  }
  flush();
  return output.join('\n');
}

function telegramTableHtml(options: string, body: string, rich = false) {
  const rows = body
    .split('\n')
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) =>
      row
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((cell) => cell.trim()),
    );
  if (!rows.length) return '';

  if (rich) {
    const hasHeader = /\bheader\b/.test(options);
    const row = (cells: string[], rowIndex: number) =>
      `<tr>${cells
        .map((source) => {
          const cell = parseTelegramTableCellMarkup(source);
          const highlighted = cell.highlight ?? (hasHeader && rowIndex === 0);
          const tag = highlighted ? 'th' : 'td';
          const align = cell.align ? ` align="${cell.align}"` : '';
          return `<${tag}${align}>${telegramMarkupToHtml(cell.text, true)}</${tag}>`;
        })
        .join('')}</tr>`;
    return `<table bordered>${rows.map(row).join('')}</table>`;
  }

  const visibleRows = rows.map((cells) =>
    cells.map((cell) => parseTelegramTableCellMarkup(cell).text),
  );

  // Telegram has no native table entity. Preserve its structure in a monospaced
  // block and make the first row visibly distinct when the editor marks it as
  // a header, instead of publishing the editor's ::: syntax verbatim.
  if (/\bheader\b/.test(options)) {
    const [header, ...content] = visibleRows;
    return `<b>${escapeHtml(header.join(' | '))}</b>${
      content.length
        ? `\n<pre>${escapeHtml(content.map((cells) => cells.join(' | ')).join('\n'))}</pre>`
        : ''
    }`;
  }
  return `<pre>${escapeHtml(visibleRows.map((cells) => cells.join(' | ')).join('\n'))}</pre>`;
}

export function telegramMarkupToHtml(raw: string, rich = false) {
  const normalizedRaw = raw.replace(/\r\n?/g, '\n');
  const tokens: string[] = [];
  const token = (html: string) => {
    const index = tokens.push(html) - 1;
    return `\uE000${index}\uE001`;
  };

  let value = normalizedRaw
    .replace(
      /^:::(quote|pullquote)(?:[ \t]+([^\n]*))?\n([\s\S]*?)\n:::/gm,
      (_match, kind: string, options: string, body: string) => {
        const credit = options?.match(/credit="([^"]+)"/)?.[1];
        const richAttribution = credit ? `<cite>${escapeHtml(credit)}</cite>` : '';
        const fallbackAttribution = credit ? `\n<i>— ${escapeHtml(credit)}</i>` : '';
        return token(
          kind === 'pullquote'
            ? rich
              ? `<aside>${escapeHtml(body).replace(/\n/g, '<br>')}${richAttribution}</aside>`
              : `<blockquote>${escapeHtml(body).replace(/\n/g, '<br>')}${fallbackAttribution}</blockquote>`
            : `<blockquote>${escapeHtml(body).replace(/\n/g, '<br>')}${rich ? richAttribution : fallbackAttribution}</blockquote>`,
        );
      },
    )
    .replace(
      /```([^\n\r`]*)((?:\r\n|[\n\r])?)([\s\S]*?)```/g,
      (_match, info: string, lineBreak: string, code: string) => {
        const parsed = parseFencedCodeBlock(info, lineBreak, code);
        const languageClass = parsed.language
          ? ` class="language-${escapeHtml(parsed.language)}"`
          : '';
        return token(
          `<pre><code${languageClass}>${escapeHtml(parsed.code)}</code></pre>`,
        );
      },
    );
  value = value.replace(
    /^:::table(?:[ \t]+([^\n]*))?\n([\s\S]*?)\n:::/gm,
    (_match, options: string | undefined, body: string) =>
      token(telegramTableHtml(options || '', body, rich)),
  );
  value = value.replace(
    /^(#{1,6})\s+(.+)$/gm,
    (_match, _marks: string, text: string) =>
      token(
        rich
          ? `<h${_marks.length}>${telegramMarkupToHtml(text, true)}</h${_marks.length}>`
          : `<b>${escapeHtml(text)}</b>`,
      ),
  );
  // Keep the stored, GPT-readable custom emoji token out of the generic HTML
  // escaping path. GramJS recognizes this Telegram-specific tag and creates a
  // MessageEntityCustomEmoji for its ALT text and 64-bit document ID.
  for (const customEmoji of [
    ...parseTelegramCustomEmojiTokens(value),
  ].reverse()) {
    value =
      value.slice(0, customEmoji.start) +
      token(
        `<tg-emoji emoji-id="${escapeHtml(customEmoji.documentId)}">${escapeHtml(customEmoji.alt)}</tg-emoji>`,
      ) +
      value.slice(customEmoji.end);
  }
  value = value.replace(/`([^`\n]+)`/g, (_match, code: string) =>
    token(`<code>${escapeHtml(code)}</code>`),
  );
  value = value.replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^\s<>()]+)\)/gi,
    (_match, label: string, href: string) => {
      try {
        const url = new URL(href);
        if (
          (url.protocol !== 'http:' && url.protocol !== 'https:') ||
          !url.hostname.includes('.')
        ) {
          return _match;
        }
        return token(
          `<a href="${escapeHtml(url.toString())}">${escapeHtml(label)}</a>`,
        );
      } catch {
        return _match;
      }
    },
  );
  const spoilers = parseTelegramSpoilers(value);
  value = spoilers.text;
  for (const entity of [...spoilers.entities].reverse()) {
    const end = entity.offset + entity.length;
    value = value.slice(0, end) + token('</tg-spoiler>') + value.slice(end);
    value =
      value.slice(0, entity.offset) +
      token('<tg-spoiler>') +
      value.slice(entity.offset);
  }
  value = escapeHtml(value)
    .replace(/\*\*([^\n]+?)\*\*/g, '<b>$1</b>')
    .replace(/__([^\n]+?)__/g, '<i>$1</i>')
    .replace(/\+\+([^\n]+?)\+\+/g, '<u>$1</u>')
    .replace(/~~([^\n]+?)~~/g, '<s>$1</s>');

  return convertBlockquotes(value).replace(
    /\uE000(\d+)\uE001/g,
    (_match, index: string) => tokens[Number(index)] ?? '',
  );
}

/** Native rich-message HTML for Bot API 10.2; standard HTML remains the MTProto fallback. */
export function telegramMarkupToRichHtml(raw: string) {
  return telegramMarkupToHtml(raw, true);
}

export function requiresNativeTelegramRichMessage(raw: string) {
  return /^(?:#{1,6}\s+|:::(?:table|pullquote)(?:\s|$))/m.test(raw.replace(/\r\n?/g, '\n'));
}

export function telegramHtmlToMtprotoHtml(html: string) {
  return (
    html
      // GramJS/MTProto currently has no entity for Telegram's newer cite and
      // pull-quote HTML tags. Preserve the author visibly inside a native quote
      // instead of silently dropping it during HTMLParser.parse().
      .replace(/<aside>/gi, '<blockquote>')
      .replace(/<\/aside>/gi, '</blockquote>')
      .replace(/<cite>([\s\S]*?)<\/cite>/gi, '\n<i>— $1</i>')
      .replace(/<\/?tg-spoiler>/g, (tag) =>
        tag.startsWith('</') ? '</spoiler>' : '<spoiler>',
      )
  );
}

/**
 * GramJS treats any MessageEntityTextUrl containing `+` as a user mention
 * while parsing album captions and drops the entity when that lookup fails.
 * Telegram's legacy joinchat URL is equivalent and avoids that parser bug.
 */
export function telegramHtmlToGramJsAlbumHtml(html: string) {
  return telegramHtmlToMtprotoHtml(html).replace(
    /(<a\b[^>]*\bhref=")https:\/\/(?:t\.me|telegram\.me)\/\+([A-Za-z0-9_-]+)(")/gi,
    '$1https://t.me/joinchat/$2$3',
  );
}

export function telegramHtmlToManagedMarkup(html: string) {
  return html
    .replace(
      /<tg-emoji\s+emoji-id="([0-9]+)">([\s\S]*?)<\/tg-emoji>/gi,
      (_match, documentId: string, alt: string) =>
        `![${alt}](tg://emoji?id=${documentId})`,
    )
    .replace(
      /<pre><code(?: class="language-([^"]+)")?>([\s\S]*?)<\/code><\/pre>/gi,
      (_match, language: string, code: string) =>
        `\`\`\`${language || ''}\n${code}\`\`\``,
    )
    .replace(/<code>([\s\S]*?)<\/code>/gi, '`$1`')
    .replace(/<(?:strong|b)>([\s\S]*?)<\/(?:strong|b)>/gi, '**$1**')
    .replace(/<(?:em|i)>([\s\S]*?)<\/(?:em|i)>/gi, '__$1__')
    .replace(/<u>([\s\S]*?)<\/u>/gi, '++$1++')
    .replace(/<(?:s|del|strike)>([\s\S]*?)<\/(?:s|del|strike)>/gi, '~~$1~~')
    .replace(/<tg-spoiler>([\s\S]*?)<\/tg-spoiler>/gi, '||$1||')
    .replace(
      /<a href="([^"]+)">([\s\S]*?)<\/a>/gi,
      (_match, href: string, label: string) => `[${label}](${href})`,
    )
    .replace(
      /<blockquote(?: expandable)?>([\s\S]*?)<\/blockquote>/gi,
      (_match, content: string) =>
        content
          .split('\n')
          .map((line: string) => `> ${line}`)
          .join('\n'),
    )
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}
