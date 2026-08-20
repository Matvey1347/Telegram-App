import { parseTelegramCustomEmojiTokens } from './telegram-custom-emoji-markup';

export type TelegramRichBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'quote'; text: string; credit?: string; pull?: boolean }
  | { type: 'table'; header: boolean; rows: string[][] }
  | { type: 'inline-media'; mediaType: 'photo' | 'video'; mediaId: string; caption?: string }
  | { type: 'paragraph'; text: string };

const richBlockStart = /^(#{1,6}\s|[-*]\s|\d+\.\s|>\s|:::|\|)/;
/** Canonical extensions: :::quote credit="…", :::pullquote credit="…", :::table header, :::photo id="…" and :::video id="…". */
export function parseTelegramRichMarkup(source: string): TelegramRichBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n'); const blocks: TelegramRichBlock[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index]!; const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) { blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] }); index++; continue; }
    const list = line.match(/^([-*]|\d+\.)\s+(.+)$/);
    if (list) { const ordered = /\d+\./.test(list[1]); const items: string[] = []; while (index < lines.length) { const item = lines[index]!.match(ordered ? /^\d+\.\s+(.+)$/ : /^[-*]\s+(.+)$/); if (!item) break; items.push(item[1]); index++; } blocks.push({ type: 'list', ordered, items }); continue; }
    const directive = line.match(/^:::(quote|pullquote|table|photo|video)(?:\s+([^]*?))?$/);
    if (directive) { const kind = directive[1]; const options = directive[2] || ''; const end = lines.indexOf(':::', index + 1); const body = lines.slice(index + 1, end < 0 ? lines.length : end); index = end < 0 ? lines.length : end + 1;
      if (kind === 'table') { blocks.push({ type: 'table', header: /\bheader\b/.test(options), rows: body.filter(Boolean).map((row) => row.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim())) }); continue; }
      if (kind === 'photo' || kind === 'video') { const mediaId = options.match(/id="([^"]+)"/)?.[1]; if (mediaId) blocks.push({ type: 'inline-media', mediaType: kind, mediaId, caption: body.join('\n') || undefined }); continue; }
      blocks.push({ type: 'quote', text: body.join('\n'), pull: kind === 'pullquote', credit: options.match(/credit="([^"]+)"/)?.[1] }); continue;
    }
    if (/^>\s?/.test(line)) { const quoted: string[] = []; while (index < lines.length && /^>\s?/.test(lines[index]!)) quoted.push(lines[index++]!.replace(/^>\s?/, '')); blocks.push({ type: 'quote', text: quoted.join('\n') }); continue; }
    if (/^\|/.test(line)) { const rows: string[][] = []; while (index < lines.length && /^\|/.test(lines[index]!)) { rows.push(lines[index++]!.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim())); } blocks.push({ type: 'table', header: false, rows }); continue; }
    const paragraph: string[] = []; while (index < lines.length && lines[index] && !richBlockStart.test(lines[index]!) && !/^:::/ .test(lines[index]!)) paragraph.push(lines[index++]!); if (paragraph.length) blocks.push({ type: 'paragraph', text: paragraph.join('\n') }); else index++;
  } return blocks;
}
export function requiresTelegramRichMessage(source: string) { return parseTelegramRichMarkup(source).some((block) => block.type !== 'paragraph' && block.type !== 'quote'); }
export function serializeTelegramRichMarkup(blocks: TelegramRichBlock[]) {
  return blocks.map((block) => {
    if (block.type === 'heading') return `${'#'.repeat(block.level)} ${block.text}`;
    if (block.type === 'list') return block.items.map((item, index) => `${block.ordered ? `${index + 1}.` : '-'} ${item}`).join('\n');
    if (block.type === 'paragraph') return block.text;
    if (block.type === 'table') return [`:::table${block.header ? ' header' : ''}`, ...block.rows.map((row) => `| ${row.join(' | ')} |`), ':::'].join('\n');
    if (block.type === 'inline-media') return [`:::${block.mediaType} id="${block.mediaId}"`, block.caption || '', ':::'].join('\n');
    if (block.pull || block.credit) return [`:::${block.pull ? 'pullquote' : 'quote'}${block.credit ? ` credit="${block.credit}"` : ''}`, block.text, ':::'].join('\n');
    return block.text.split('\n').map((line) => `> ${line}`).join('\n');
  }).join('\n\n');
}
export function telegramRichBlocksToBotApi(source: string) {
  return parseTelegramRichMarkup(source).map((block) => ({ ...block, text: 'text' in block ? richText(block.text) : undefined }));
}
function richText(text: string) { return [...parseTelegramCustomEmojiTokens(text)].length ? { text, customEmoji: true } : { text }; }
export const TELEGRAM_RICH_FORMATTING_GUIDE = `TELEGRAM TEXT VISUAL CHEATSHEET

This file uses the editor's canonical source syntax. Keep this source exactly when returning posts to Telegram System.

Bold
Syntax: **bold text**

Italic
Syntax: __italic text__

Underline
Syntax: ++underlined text++

Strikethrough
Syntax: ~~struck text~~

Spoiler
Syntax: ||hidden text||

Inline code
Syntax: \`inline code\`

Code block
Syntax:
\`\`\`language
code content
\`\`\`
Notes: The optional first line is a language/title label. Keep links outside code blocks when they must remain clickable.

Plain URL: https://example.com
Text link: [visible text](https://example.com)
Internal post link: [visible text](tg-post:POST_ID). Never change POST_ID.
Telegram mentions, hashtags, cashtags, bot commands, email addresses and phone numbers remain plain text (for example @username, #topic, $USD, /start, email@example.com, +48123123123).

Quote
Syntax: > quoted text
Multi-line quote: prefix every line with >.

Heading
Syntax: # Heading 1 through ###### Heading 6.

Bulleted list
Syntax: - item

Numbered list
Syntax: 1. item

Rich quote with optional credit
Syntax:
:::quote credit="Author"
quote content
:::

Centered pull quote with optional credit
Syntax:
:::pullquote credit="Author"
quote content
:::

Table with header row
Syntax:
:::table header
| Header 1 | Header 2 |
| Cell 1 | Cell 2 |
:::

Inline photo or video
Syntax:
:::photo id="stable-media-id"
optional caption
:::
Use :::video for video. IDs are stable internal media IDs, never blob URLs.

Formula
Syntax: $$formula$$

Premium Emoji
Syntax: ![ALT](tg://emoji?id=DOCUMENT_ID)
Only use document IDs listed in the Premium Emoji section below; never invent an ID.

Combining formats is allowed outside code blocks, for example **bold __italic__** and a Premium Emoji.`;
