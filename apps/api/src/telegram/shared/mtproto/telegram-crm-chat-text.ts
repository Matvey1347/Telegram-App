import { BadRequestException } from '@nestjs/common';
import { parseTelegramHtml } from '../markup/telegram-html-parser';
import {
  telegramMarkupToHtml,
  telegramHtmlToMtprotoHtml,
} from '../markup/telegram-markup';
import { crmMessageEntities } from './telegram-crm-message-metadata';

export function parseCrmOutgoingText(value: string) {
  return parseTelegramHtml(
    telegramHtmlToMtprotoHtml(telegramMarkupToHtml(value)),
  );
}

/** Telegram offsets and JS string lengths are UTF-16 code units. */
export function normalizeCrmOutgoingText(value: string, limit = 4096) {
  const [text, entities] = parseCrmOutgoingText(value);
  if (text.length > limit)
    throw new BadRequestException('INVALID_MESSAGE_LENGTH');
  return { text, entities: crmMessageEntities(entities, text) };
}
