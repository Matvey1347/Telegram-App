import { Api } from 'telegram';

export function crmSafeFileName(value: string) {
  return (
    value
      // ASCII controls and separators cannot be HTTP/header/path file names.
      // eslint-disable-next-line no-control-regex
      .replace(/[\\/\u0000-\u001f\u007f]/g, '_')
      .replace(/^\.+/, '')
      .slice(0, 180) || 'attachment'
  );
}

export function crmMessageReactions(value?: Api.TypeMessageReactions) {
  return (value?.results ?? []).slice(0, 100).flatMap((item) => {
    const emoji =
      item.reaction instanceof Api.ReactionEmoji
        ? item.reaction.emoticon
        : item.reaction instanceof Api.ReactionCustomEmoji
          ? `custom:${item.reaction.documentId.toString()}`
          : null;
    return emoji && Number.isSafeInteger(item.count) && item.count > 0
      ? [{ emoji, count: item.count, chosen: item.chosenOrder !== undefined }]
      : [];
  });
}

export function crmMessageEntities(
  entities: Api.TypeMessageEntity[] | undefined,
  text: string,
) {
  const types: Record<string, string> = {
    MessageEntityBold: 'bold',
    MessageEntityItalic: 'italic',
    MessageEntityUnderline: 'underline',
    MessageEntityStrike: 'strike',
    MessageEntityCode: 'code',
    MessageEntityPre: 'pre',
    MessageEntityTextUrl: 'textUrl',
    MessageEntityUrl: 'url',
    MessageEntitySpoiler: 'spoiler',
    MessageEntityBlockquote: 'blockquote',
    MessageEntityCustomEmoji: 'customEmoji',
  };
  return (entities ?? []).slice(0, 100).flatMap((entity) => {
    const type = types[entity.className];
    if (
      !type ||
      entity.offset < 0 ||
      entity.length <= 0 ||
      entity.offset + entity.length > text.length
    )
      return [];
    const url =
      entity instanceof Api.MessageEntityTextUrl ? entity.url : undefined;
    if (url && !/^(https?:\/\/|mailto:)/i.test(url)) return [];
    return [
      {
        type,
        offset: entity.offset,
        length: entity.length,
        ...(url ? { url: url.slice(0, 2048) } : {}),
        ...(entity instanceof Api.MessageEntityPre
          ? { language: entity.language.slice(0, 50) }
          : {}),
        ...(entity instanceof Api.MessageEntityCustomEmoji
          ? { documentId: entity.documentId.toString() }
          : {}),
      },
    ];
  });
}

export function crmMessageMedia(value?: Api.TypeMessageMedia) {
  if (
    value instanceof Api.MessageMediaDocument &&
    value.document instanceof Api.Document
  ) {
    const doc = value.document;
    const audio = doc.attributes.find(
      (a): a is Api.DocumentAttributeAudio =>
        a instanceof Api.DocumentAttributeAudio,
    );
    const video = doc.attributes.find(
      (a): a is Api.DocumentAttributeVideo =>
        a instanceof Api.DocumentAttributeVideo,
    );
    const filename = doc.attributes.find(
      (a): a is Api.DocumentAttributeFilename =>
        a instanceof Api.DocumentAttributeFilename,
    );
    return {
      kind: audio ? 'audio' : video ? 'video' : 'file',
      fileName: crmSafeFileName(
        filename?.fileName ?? (audio?.voice ? 'voice.ogg' : 'attachment'),
      ),
      mimeType: doc.mimeType.slice(0, 100),
      size: Number(doc.size.toString()),
      ...(audio
        ? { duration: audio.duration, voice: Boolean(audio.voice) }
        : {}),
      ...(video ? { duration: video.duration } : {}),
    };
  }
  if (
    value instanceof Api.MessageMediaPhoto &&
    value.photo instanceof Api.Photo
  ) {
    const sizes = value.photo.sizes.flatMap((s) =>
      s instanceof Api.PhotoSize
        ? [s.size]
        : s instanceof Api.PhotoSizeProgressive
          ? s.sizes
          : [],
    );
    return {
      kind: 'image',
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
      size: Math.max(0, ...sizes),
    };
  }
  return null;
}

export function crmMessageMetadata(value: Api.Message) {
  const entities = crmMessageEntities(value.entities, value.message);
  const reactions = crmMessageReactions(value.reactions);
  const media = crmMessageMedia(value.media);
  const reply =
    value.replyTo instanceof Api.MessageReplyHeader
      ? value.replyTo.replyToMsgId
      : undefined;
  const metadata = {
    ...(value.media ? { mediaType: value.media.className } : {}),
    ...(entities.length ? { entities } : {}),
    ...(reactions.length ? { reactions } : {}),
    ...(media ? { media } : {}),
    ...(reply ? { replyToTelegramMessageId: reply } : {}),
    ...(value.noforwards ? { protectedContent: true } : {}),
    ...(value.fwdFrom
      ? {
          forwarded: {
            date: new Date(value.fwdFrom.date * 1000).toISOString(),
            ...(value.fwdFrom.fromName
              ? { author: value.fwdFrom.fromName.slice(0, 200) }
              : {}),
          },
        }
      : {}),
  };
  return Object.keys(metadata).length ? metadata : null;
}
