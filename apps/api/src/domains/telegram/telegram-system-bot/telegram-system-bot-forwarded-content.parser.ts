import { telegramHtmlToManagedMarkup } from '../../../telegram/shared/telegram-markup';

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
  animation?: {
    file_id?: string;
    file_unique_id?: string;
    file_size?: number;
    width?: number;
    height?: number;
    duration?: number;
    mime_type?: string;
    file_name?: string;
  };
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
  video?: {
    file_id?: string;
    file_unique_id?: string;
    file_size?: number;
    width?: number;
    height?: number;
    duration?: number;
    mime_type?: string;
    file_name?: string;
  };
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
  formattedHtml: string;
  textSource: 'text' | 'caption' | null;
  entities: unknown[];
  photo: {
    fileId: string;
    fileUniqueId: string | null;
    fileSize: number | null;
    width: number | null;
    height: number | null;
  } | null;
  media: {
    kind: 'PHOTO' | 'VIDEO' | 'ANIMATION';
    fileId: string;
    fileUniqueId: string | null;
    fileSize: number | null;
    width: number | null;
    height: number | null;
    durationSeconds: number | null;
    mimeType: string | null;
    fileName: string | null;
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
  'audio',
  'document',
  'paid_media',
  'sticker',
  'story',
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
  const media = normalizeMedia(message, photo);
  if (!text.trim() && !media) {
    return {
      ok: false,
      reason: 'EMPTY_MESSAGE',
      unsupportedMedia: [],
      warnings: [...warnings],
    };
  }

  const buttonRows = normalizeButtons(message, warnings);
  const preservedText = entitiesToPreservedContent(
    rawText ?? '',
    textSource === 'text'
      ? message.entities
      : textSource === 'caption'
        ? message.caption_entities
        : [],
  );
  return {
    ok: true,
    content: {
      telegramMessageId: message.message_id ?? null,
      mediaGroupId: message.media_group_id ?? null,
      text,
      managedText: preservedText.managedText,
      formattedHtml: preservedText.formattedHtml,
      textSource,
      entities:
        textSource === 'text'
          ? [...(message.entities ?? [])]
          : textSource === 'caption'
            ? [...(message.caption_entities ?? [])]
            : [],
      photo,
      media,
      buttonRows,
      forward,
    },
    warnings: [...warnings],
  };
}

function normalizeMedia(
  message: TelegramSystemBotIncomingMessage,
  photo: TelegramSystemBotForwardedContent['photo'],
): TelegramSystemBotForwardedContent['media'] {
  if (message.animation?.file_id) {
    return telegramFileMedia('ANIMATION', message.animation);
  }
  if (message.video?.file_id) {
    return telegramFileMedia('VIDEO', message.video);
  }
  return photo
    ? {
        kind: 'PHOTO',
        fileId: photo.fileId,
        fileUniqueId: photo.fileUniqueId,
        fileSize: photo.fileSize,
        width: photo.width,
        height: photo.height,
        durationSeconds: null,
        mimeType: null,
        fileName: null,
      }
    : null;
}

function telegramFileMedia(
  kind: 'VIDEO' | 'ANIMATION',
  file: NonNullable<TelegramSystemBotIncomingMessage['video']>,
): NonNullable<TelegramSystemBotForwardedContent['media']> {
  return {
    kind,
    fileId: file.file_id!,
    fileUniqueId: file.file_unique_id ?? null,
    fileSize: file.file_size ?? null,
    width: file.width ?? null,
    height: file.height ?? null,
    durationSeconds: file.duration ?? null,
    mimeType: file.mime_type ?? null,
    fileName: file.file_name ?? null,
  };
}

type BotEntity = {
  type?: string;
  offset?: number;
  length?: number;
  url?: string;
  language?: string;
  custom_emoji_id?: string;
  unix_time?: number;
  date_time_format?: string;
  user?: { id?: number | string };
};

function entitiesToPreservedContent(text: string, rawEntities: unknown[] = []) {
  const entities = mergeCompatibleEntities(
    rawEntities
      .filter((value): value is BotEntity =>
        Boolean(value && typeof value === 'object'),
      )
      .flatMap((entity, order) => {
        const offset = entity.offset ?? -1;
        const length = entity.length ?? 0;
        const tags = entityTags(entity);
        return offset >= 0 &&
          length > 0 &&
          offset + length <= text.length &&
          tags
          ? [
              {
                offset,
                end: offset + length,
                order,
                linkDepth: entity.type === 'text_link' ? 1 : 0,
                mergeKey: mergeableEntityKey(entity),
                ...tags,
              },
            ]
          : [];
      }),
  );
  if (!entities.length) {
    return {
      managedText: escapeManagedText(normalizeText(text)),
      formattedHtml: escapeHtml(normalizeText(text)),
    };
  }
  let managedHtml = '';
  let formattedHtml = '';
  for (let index = 0; index <= text.length; index += 1) {
    const closingTags = entities
      .filter((entity) => entity.end === index)
      .sort(
        (left, right) =>
          right.offset - left.offset ||
          right.linkDepth - left.linkDepth ||
          right.order - left.order,
      )
      .map((entity) => entity.close)
      .join('');
    managedHtml += closingTags;
    formattedHtml += closingTags;
    const openingTags = entities
      .filter((entity) => entity.offset === index)
      .sort(
        (left, right) =>
          right.end - left.end ||
          left.linkDepth - right.linkDepth ||
          left.order - right.order,
      )
      .map((entity) => entity.open)
      .join('');
    managedHtml += openingTags;
    formattedHtml += openingTags;
    if (index < text.length) {
      managedHtml += escapeHtml(escapeManagedTextCharacter(text[index]));
      formattedHtml += escapeHtml(text[index]);
    }
  }
  return {
    managedText: telegramHtmlToManagedMarkup(managedHtml).replace(
      /\r\n?/g,
      '\n',
    ),
    formattedHtml: formattedHtml.replace(/\r\n?/g, '\n'),
  };
}

type RenderEntity = {
  offset: number;
  end: number;
  order: number;
  linkDepth: number;
  mergeKey: string | null;
  open: string;
  close: string;
};

function mergeCompatibleEntities(entities: RenderEntity[]) {
  const merged: RenderEntity[] = [];
  for (const entity of [...entities].sort(
    (left, right) =>
      left.offset - right.offset ||
      left.end - right.end ||
      left.order - right.order,
  )) {
    const existing = entity.mergeKey
      ? [...merged]
          .reverse()
          .find(
            (candidate) =>
              candidate.mergeKey === entity.mergeKey &&
              entity.offset <= candidate.end,
          )
      : merged.find(
          (candidate) =>
            candidate.offset === entity.offset &&
            candidate.end === entity.end &&
            candidate.open === entity.open &&
            candidate.close === entity.close,
        );
    if (existing) {
      existing.end = Math.max(existing.end, entity.end);
      continue;
    }
    merged.push({ ...entity });
  }
  return merged;
}

function mergeableEntityKey(entity: BotEntity) {
  if (
    entity.type &&
    [
      'bold',
      'italic',
      'underline',
      'strikethrough',
      'spoiler',
      'code',
      'blockquote',
      'expandable_blockquote',
    ].includes(entity.type)
  ) {
    return entity.type;
  }
  if (entity.type === 'pre') return `pre:${entity.language ?? ''}`;
  if (entity.type === 'text_link') return `link:${entity.url ?? ''}`;
  if (entity.type === 'text_mention') {
    return `mention:${String(entity.user?.id ?? '')}`;
  }
  return null;
}

function escapeManagedTextCharacter(value: string) {
  return /[\\`*_[\]()#+~|>:]/.test(value) ? `\\${value}` : value;
}

function escapeManagedText(value: string) {
  return [...value].map(escapeManagedTextCharacter).join('');
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
    entity.type === 'text_mention' &&
    /^\d+$/.test(String(entity.user?.id ?? ''))
  ) {
    return {
      open: `<a href="tg://user?id=${String(entity.user!.id)}">`,
      close: '</a>',
    };
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
  if (
    entity.type === 'date_time' &&
    Number.isSafeInteger(entity.unix_time) &&
    isTelegramDateTimeFormat(entity.date_time_format)
  ) {
    const format = entity.date_time_format;
    return {
      open: `<tg-time unix="${entity.unix_time}"${format ? ` format="${format}"` : ''}>`,
      close: '</tg-time>',
    };
  }
  return null;
}

function isTelegramDateTimeFormat(value: string | undefined) {
  return value === undefined || /^(?:r|w?[dD]?[tT]?)$/.test(value);
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
  return value?.replace(/\r\n?/g, '\n') ?? '';
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
