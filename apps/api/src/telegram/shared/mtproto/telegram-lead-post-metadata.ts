import { Api } from 'telegram';
import { telegramLongString } from './telegram-crm-mtproto.normalizer';
import type { TelegramLeadPostMetadata } from './telegram-lead-channel.types';

/** Ephemeral transport data: URLs may be sensitive; never log or persist without a reviewed policy. */
export function telegramLeadPostMetadata(
  message: Api.Message,
): TelegramLeadPostMetadata {
  const entityUrls: string[] = [],
    textUrls: string[] = [],
    mentions: string[] = [],
    inlineButtonUrls: string[] = [];
  const incomplete = new Set<string>();
  const unsupportedEntityTypes = new Set<string>();
  let urlBytes = 0;
  const text = message.message ?? '';
  const addUrl = (list: string[], raw: string) => {
    const value =
      /^(?:t\.me|telegram\.me|www\.)\//i.test(raw) || /^www\.[^/]+/i.test(raw)
        ? `https://${raw}`
        : raw;
    if (list.includes(value)) return;
    if (list.length >= 30 || raw.length > 500) {
      incomplete.add('URL_LIMIT');
      return;
    }
    const bytes = Buffer.byteLength(value, 'utf8');
    if (urlBytes + bytes > 4096) {
      incomplete.add('METADATA_SIZE_LIMIT');
      return;
    }
    try {
      const url = new URL(value);
      if (
        !['https:', 'http:'].includes(url.protocol) ||
        url.username ||
        url.password
      ) {
        incomplete.add('UNSUPPORTED_URL');
        return;
      }
      list.push(value);
      urlBytes += bytes;
    } catch {
      incomplete.add('UNSUPPORTED_URL');
    }
  };
  if ((message.entities?.length ?? 0) > 100) incomplete.add('ENTITY_LIMIT');
  for (const entity of (message.entities ?? []).slice(0, 100)) {
    if (
      entity instanceof Api.MessageEntityBold ||
      entity instanceof Api.MessageEntityItalic ||
      entity instanceof Api.MessageEntityUnderline ||
      entity instanceof Api.MessageEntityStrike ||
      entity instanceof Api.MessageEntityBlockquote ||
      entity instanceof Api.MessageEntityHashtag ||
      entity instanceof Api.MessageEntityCode ||
      entity instanceof Api.MessageEntitySpoiler ||
      entity instanceof Api.MessageEntityCustomEmoji ||
      entity instanceof Api.MessageEntityPhone
    ) {
      if (
        !Number.isSafeInteger(entity.offset) ||
        !Number.isSafeInteger(entity.length) ||
        entity.offset < 0 ||
        entity.length < 1 ||
        entity.offset + entity.length > text.length
      )
        incomplete.add('INVALID_ENTITY_OFFSET');
      continue;
    }
    if (
      entity instanceof Api.MessageEntityTextUrl ||
      entity instanceof Api.MessageEntityUrl ||
      entity instanceof Api.MessageEntityMention
    ) {
      if (
        !Number.isSafeInteger(entity.offset) ||
        !Number.isSafeInteger(entity.length) ||
        entity.offset < 0 ||
        entity.length < 1 ||
        entity.offset + entity.length > text.length
      ) {
        incomplete.add('INVALID_ENTITY_OFFSET');
        continue;
      }
      const value = text.slice(entity.offset, entity.offset + entity.length);
      if (entity instanceof Api.MessageEntityTextUrl) {
        const before = entityUrls.length;
        addUrl(entityUrls, entity.url);
        const value =
          entityUrls.length > before
            ? entityUrls.at(-1)
            : entityUrls.find((item) => item === entity.url);
        if (value && !textUrls.includes(value)) textUrls.push(value);
      } else if (entity instanceof Api.MessageEntityUrl)
        addUrl(entityUrls, value);
      else if (!/^@[A-Za-z][A-Za-z0-9_]{3,31}$/.test(value))
        incomplete.add('MENTION_UNAVAILABLE');
      else if (!mentions.includes(value)) {
        if (mentions.length >= 30) incomplete.add('MENTION_LIMIT');
        else mentions.push(value);
      }
    } else {
      incomplete.add('UNSUPPORTED_ENTITY');
      const kind = entity.className;
      if (/^MessageEntity[A-Za-z0-9]{1,40}$/.test(kind))
        unsupportedEntityTypes.add(kind);
    }
  }
  if (message.replyMarkup instanceof Api.ReplyInlineMarkup) {
    if (message.replyMarkup.rows.length > 20) incomplete.add('BUTTON_LIMIT');
    for (const row of message.replyMarkup.rows.slice(0, 20)) {
      if (row.buttons.length > 20) incomplete.add('BUTTON_LIMIT');
      for (const button of row.buttons.slice(0, 20))
        if (button instanceof Api.KeyboardButtonUrl)
          addUrl(inlineButtonUrls, button.url);
        else if (button instanceof Api.KeyboardButtonUrlAuth)
          incomplete.add('AUTH_BUTTON_UNAVAILABLE');
        else incomplete.add('UNSUPPORTED_BUTTON');
    }
  } else if (message.replyMarkup) incomplete.add('UNSUPPORTED_MARKUP');
  const forward = message.fwdFrom;
  const hasMedia = Boolean(
    message.media && !(message.media instanceof Api.MessageMediaEmpty),
  );
  if (forward && !(forward.fromId instanceof Api.PeerChannel))
    incomplete.add('FORWARD_SOURCE_UNKNOWN');
  const textComplete = incomplete.size === 0;
  if (hasMedia) incomplete.add('MEDIA_CONTENT_UNAVAILABLE');
  return {
    complete: incomplete.size === 0,
    textComplete,
    incompleteReasons: [...incomplete],
    ...(unsupportedEntityTypes.size
      ? { unsupportedEntityTypes: [...unsupportedEntityTypes] }
      : {}),
    entityUrls,
    textUrls,
    inlineButtonUrls,
    mentions,
    hasForwardMetadata: Boolean(forward),
    forwardChannelId:
      forward?.fromId instanceof Api.PeerChannel
        ? telegramLongString(forward.fromId.channelId)
        : null,
    hasMedia,
    mediaType: !hasMedia
      ? null
      : message.media instanceof Api.MessageMediaPhoto
        ? 'PHOTO'
        : message.media instanceof Api.MessageMediaDocument
          ? 'DOCUMENT'
          : 'OTHER',
  };
}
