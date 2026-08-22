import { HTMLParser } from 'telegram/extensions/html';

/** Keeps the Telegram SDK parser behind the shared integration boundary. */
export function parseTelegramHtml(html: string) {
  return HTMLParser.parse(html);
}
