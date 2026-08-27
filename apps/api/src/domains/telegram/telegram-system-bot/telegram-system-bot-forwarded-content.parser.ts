export type TelegramSystemBotIncomingButton = {
  text?: string;
  url?: string;
  style?: string;
  callback_data?: string;
  web_app?: unknown;
  login_url?: unknown;
  switch_inline_query?: string;
  switch_inline_query_current_chat?: string;
  copy_text?: unknown;
  callback_game?: unknown;
  pay?: boolean;
};

export type TelegramSystemBotIncomingMessage = {
  message_id?: number;
  text?: string;
  caption?: string;
  entities?: unknown[];
  caption_entities?: unknown[];
  media_group_id?: string;
  photo?: Array<{
    file_id?: string;
    file_unique_id?: string;
    file_size?: number;
    width?: number;
    height?: number;
  }>;
  reply_markup?: {
    inline_keyboard?: TelegramSystemBotIncomingButton[][];
  };
  forward_origin?: {
    type?: string;
    date?: number;
    message_id?: number;
    chat?: {
      id?: number | string;
      title?: string;
      username?: string;
      type?: string;
    };
    sender_user?: {
      id?: number | string;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
    sender_user_name?: string;
  };
  forward_from_chat?: {
    id?: number | string;
    title?: string;
    username?: string;
    type?: string;
  };
  forward_from_message_id?: number;
  forward_from?: {
    id?: number | string;
    username?: string;
    first_name?: string;
    last_name?: string;
  };
  forward_sender_name?: string;
  forward_date?: number;
  animation?: unknown;
  audio?: unknown;
  document?: {
    file_id?: string;
    file_size?: number;
    mime_type?: string;
    file_name?: string;
  };
  paid_media?: unknown;
  sticker?: unknown;
  story?: unknown;
  video?: unknown;
  video_note?: unknown;
  voice?: unknown;
};

export type TelegramSystemBotForwardedContentWarning =
  | 'NOT_FORWARDED'
  | 'UNSUPPORTED_BUTTONS_REMOVED'
  | 'INVALID_URL_BUTTONS_REMOVED';

export type TelegramSystemBotForwardedContent = {
  telegramMessageId: number | null;
  mediaGroupId: string | null;
  text: string;
  managedText: string;
  textSource: 'text' | 'caption' | null;
  entities: unknown[];
  photo: {
    fileId: string;
    fileUniqueId: string | null;
    fileSize: number | null;
    width: number | null;
    height: number | null;
  } | null;
  buttonRows: Array<
    Array<{
      text: string;
      url: string;
      style: 'default' | 'primary' | 'success' | 'danger';
    }>
  >;
  forward: {
    type: string;
    date: string | null;
    sourceChatId: string | null;
    sourceChatType: string | null;
    sourceChatTitle: string | null;
    sourceChatUsername: string | null;
    sourceMessageId: number | null;
    senderUserId: string | null;
    senderUsername: string | null;
    senderName: string | null;
  } | null;
};

export type TelegramSystemBotForwardedContentParseResult =
  | {
      ok: true;
      content: TelegramSystemBotForwardedContent;
      warnings: TelegramSystemBotForwardedContentWarning[];
    }
  | {
      ok: false;
      reason: 'EMPTY_MESSAGE' | 'UNSUPPORTED_MEDIA';
      unsupportedMedia: string[];
      warnings: TelegramSystemBotForwardedContentWarning[];
    };

const supportedButtonStyles = new Set([
  'default',
  'primary',
  'success',
  'danger',
]);

const unsupportedMediaKeys = [
  'animation',
  'audio',
  'document',
  'paid_media',
  'sticker',
  'story',
  'video',
  'video_note',
  'voice',
] as const;

export function parseTelegramSystemBotForwardedContent(
  message: TelegramSystemBotIncomingMessage,
): TelegramSystemBotForwardedContentParseResult {
  const warnings = new Set<TelegramSystemBotForwardedContentWarning>();
  const forward = normalizeForward(message);
  if (!forward) warnings.add('NOT_FORWARDED');

  const unsupportedMedia = unsupportedMediaKeys.filter(
    (key) => message[key] !== undefined && message[key] !== null,
  );
  if (unsupportedMedia.length) {
    return {
      ok: false,
      reason: 'UNSUPPORTED_MEDIA',
      unsupportedMedia,
      warnings: [...warnings],
    };
  }

  const rawText = message.text ?? message.caption;
  const textSource =
    message.text !== undefined
      ? ('text' as const)
      : message.caption !== undefined
        ? ('caption' as const)
        : null;
  const text = normalizeText(rawText);
  const photo = bestPhoto(message.photo);
  if (!text && !photo) {
    return {
      ok: false,
      reason: 'EMPTY_MESSAGE',
      unsupportedMedia: [],
      warnings: [...warnings],
    };
  }

  const buttonRows = normalizeButtons(message, warnings);
  return {
    ok: true,
    content: {
      telegramMessageId: message.message_id ?? null,
      mediaGroupId: message.media_group_id ?? null,
      text,
      managedText: entitiesToManagedMarkup(
        rawText ?? '',
        textSource === 'text'
          ? message.entities
          : textSource === 'caption'
            ? message.caption_entities
            : [],
      ),
      textSource,
      entities:
        textSource === 'text'
          ? [...(message.entities ?? [])]
          : textSource === 'caption'
            ? [...(message.caption_entities ?? [])]
            : [],
      photo,
      buttonRows,
      forward,
    },
    warnings: [...warnings],
  };
}

type BotEntity = {
  type?: string;
  offset?: number;
  length?: number;
  url?: string;
  language?: string;
  custom_emoji_id?: string;
};

function entitiesToManagedMarkup(text: string, rawEntities: unknown[] = []) {
  const entities = rawEntities
    .filter((value): value is BotEntity =>
      Boolean(value && typeof value === 'object'),
    )
    .flatMap((entity) => {
      const offset = entity.offset ?? -1;
      const length = entity.length ?? 0;
      const tags = entityTags(entity);
      return offset >= 0 && length > 0 && offset + length <= text.length && tags
        ? [{ offset, end: offset + length, ...tags }]
        : [];
    });
  if (!entities.length) return normalizeText(text);
  let html = '';
  for (let index = 0; index <= text.length; index += 1) {
    html += entities
      .filter((entity) => entity.end === index)
      .sort((left, right) => right.offset - left.offset)
      .map((entity) => entity.close)
      .join('');
    html += entities
      .filter((entity) => entity.offset === index)
      .sort((left, right) => right.end - left.end)
      .map((entity) => entity.open)
      .join('');
    if (index < text.length) html += escapeHtml(text[index]);
  }
  return telegramHtmlToManagedMarkup(html).replace(/\r\n?/g, '\n').trim();
}

function entityTags(entity: BotEntity) {
  const plain: Record<string, [string, string]> = {
    bold: ['<b>', '</b>'],
    italic: ['<i>', '</i>'],
    underline: ['<u>', '</u>'],
    strikethrough: ['<s>', '</s>'],
    spoiler: ['<tg-spoiler>', '</tg-spoiler>'],
    code: ['<code>', '</code>'],
    blockquote: ['<blockquote>', '</blockquote>'],
    expandable_blockquote: ['<blockquote expandable>', '</blockquote>'],
  };
  if (entity.type && plain[entity.type]) {
    const [open, close] = plain[entity.type];
    return { open, close };
  }
  if (entity.type === 'pre') {
    const language = entity.language?.replace(/[^a-z0-9_+-]/gi, '') ?? '';
    return {
      open: `<pre><code${language ? ` class="language-${language}"` : ''}>`,
      close: '</code></pre>',
    };
  }
  if (entity.type === 'text_link' && safeEntityUrl(entity.url)) {
    return { open: `<a href="${escapeHtml(entity.url!)}">`, close: '</a>' };
  }
  if (
    entity.type === 'custom_emoji' &&
    /^\d+$/.test(entity.custom_emoji_id ?? '')
  ) {
    return {
      open: `<tg-emoji emoji-id="${entity.custom_emoji_id}">`,
      close: '</tg-emoji>',
    };
  }
  return null;
}

function safeEntityUrl(value: string | undefined) {
  if (!value) return false;
  try {
    return ['http:', 'https:', 'tg:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeText(value: string | undefined) {
  return value?.replace(/\r\n?/g, '\n').trim() ?? '';
}

function bestPhoto(messagePhotos: TelegramSystemBotIncomingMessage['photo']) {
  const photos = (messagePhotos ?? []).filter(
    (photo): photo is typeof photo & { file_id: string } =>
      typeof photo.file_id === 'string' && Boolean(photo.file_id),
  );
  const photo = [...photos].sort(
    (left, right) =>
      (right.file_size ?? 0) - (left.file_size ?? 0) ||
      (right.width ?? 0) * (right.height ?? 0) -
        (left.width ?? 0) * (left.height ?? 0),
  )[0];
  return photo
    ? {
        fileId: photo.file_id,
        fileUniqueId: photo.file_unique_id ?? null,
        fileSize: photo.file_size ?? null,
        width: photo.width ?? null,
        height: photo.height ?? null,
      }
    : null;
}

function normalizeButtons(
  message: TelegramSystemBotIncomingMessage,
  warnings: Set<TelegramSystemBotForwardedContentWarning>,
) {
  return (message.reply_markup?.inline_keyboard ?? []).flatMap((row) => {
    const supported = row.flatMap((button) => {
      if (!button.url) {
        warnings.add('UNSUPPORTED_BUTTONS_REMOVED');
        return [];
      }
      if (!isSupportedUrl(button.url)) {
        warnings.add('INVALID_URL_BUTTONS_REMOVED');
        return [];
      }
      const style = supportedButtonStyles.has(button.style ?? '')
        ? (button.style as 'default' | 'primary' | 'success' | 'danger')
        : 'default';
      return [
        {
          text: button.text?.trim() || button.url,
          url: button.url,
          style,
        },
      ];
    });
    return supported.length ? [supported] : [];
  });
}

function isSupportedUrl(value: string) {
  try {
    return ['http:', 'https:', 'tg:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function normalizeForward(message: TelegramSystemBotIncomingMessage) {
  const origin = message.forward_origin;
  const chat = origin?.chat ?? message.forward_from_chat;
  const sender = origin?.sender_user ?? message.forward_from;
  const senderName =
    origin?.sender_user_name ??
    message.forward_sender_name ??
    ([sender?.first_name, sender?.last_name].filter(Boolean).join(' ') || null);
  const date = origin?.date ?? message.forward_date;
  if (!origin && !chat && !sender && !senderName && !date) return null;
  return {
    type: origin?.type ?? (chat ? 'channel' : sender ? 'user' : 'hidden_user'),
    date: telegramDate(date),
    sourceChatId: chat?.id === undefined ? null : String(chat.id),
    sourceChatType: chat?.type ?? null,
    sourceChatTitle: chat?.title ?? null,
    sourceChatUsername: chat?.username ?? null,
    sourceMessageId:
      origin?.message_id ?? message.forward_from_message_id ?? null,
    senderUserId: sender?.id === undefined ? null : String(sender.id),
    senderUsername: sender?.username ?? null,
    senderName,
  };
}

function telegramDate(value: number | undefined) {
  if (!value || !Number.isFinite(value)) return null;
  const date = new Date(value * 1_000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
import { telegramHtmlToManagedMarkup } from '../../../telegram/shared/telegram-markup';
