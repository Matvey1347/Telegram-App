import { Api } from 'telegram';
import { returnBigInt } from 'telegram/Helpers';

export type TelegramCustomEmojiToken = {
  alt: string;
  documentId: string;
  start: number;
  end: number;
  raw: string;
};

const TOKEN = /!\[([^\]\r\n]*)\]\(tg:\/\/emoji\?id=([0-9]+)\)/g;

/** Parses the sole canonical source representation used in managed-post text. */
export function parseTelegramCustomEmojiTokens(source: string) {
  const tokens: TelegramCustomEmojiToken[] = [];
  for (const match of source.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    const alt = match[1] ?? '';
    const documentId = match[2] ?? '';
    if (!alt || !documentId) continue;
    tokens.push({
      alt,
      documentId,
      start: index,
      end: index + match[0].length,
      raw: match[0],
    });
  }
  return tokens;
}

export function renderTelegramCustomEmojiToken(
  alt: string,
  documentId: string,
) {
  if (!alt || !/^\d+$/.test(documentId)) {
    throw new Error(
      'A custom emoji requires a non-empty alt and numeric document ID.',
    );
  }
  return `![${alt}](tg://emoji?id=${documentId})`;
}

export function telegramCustomEmojiToWireText(source: string) {
  const tokens = parseTelegramCustomEmojiTokens(source);
  let cursor = 0;
  let text = '';
  const entities: Api.MessageEntityCustomEmoji[] = [];
  for (const token of tokens) {
    text += source.slice(cursor, token.start);
    const offset = text.length; // JavaScript string indices are UTF-16 code units.
    text += token.alt;
    entities.push(
      new Api.MessageEntityCustomEmoji({
        offset,
        length: token.alt.length,
        documentId: returnBigInt(token.documentId),
      }),
    );
    cursor = token.end;
  }
  return { text: text + source.slice(cursor), entities };
}

export function telegramWireTextToCustomEmojiMarkup(params: {
  text: string;
  entities: Array<{
    offset?: number;
    length?: number;
    documentId?: unknown;
    className?: string;
  }>;
}) {
  const entities = params.entities
    .filter(
      (entity) =>
        entity.className === 'MessageEntityCustomEmoji' ||
        entity.documentId != null,
    )
    .filter(
      (entity) =>
        Number.isInteger(entity.offset) &&
        Number.isInteger(entity.length) &&
        Number(entity.length) > 0 &&
        entity.documentId != null,
    )
    .sort((a, b) => Number(b.offset) - Number(a.offset));
  let source = params.text;
  for (const entity of entities) {
    const start = Number(entity.offset);
    const end = start + Number(entity.length);
    const alt = source.slice(start, end);
    const documentId = String(entity.documentId);
    if (!alt || !/^\d+$/.test(documentId)) continue;
    source =
      source.slice(0, start) +
      renderTelegramCustomEmojiToken(alt, documentId) +
      source.slice(end);
  }
  return source;
}
