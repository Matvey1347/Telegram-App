import type { TelegramPostMediaItem } from '@telegram-system/shared';

export function telegramBotMediaDelivery(
  mediaItems: TelegramPostMediaItem[],
  caption: { text: string; entities: unknown[] },
) {
  if (mediaItems.length > 1) {
    return {
      method: 'sendMediaGroup',
      body: {
        media: mediaItems.map((item, index) => ({
          type: item.kind === 'VIDEO' ? 'video' : 'photo',
          media: item.url,
          ...(index === 0 && caption.text
            ? { caption: caption.text, caption_entities: caption.entities }
            : {}),
        })),
      },
      expectedMessageCount: mediaItems.length,
    };
  }
  const item = mediaItems[0];
  const method =
    item.kind === 'VIDEO'
      ? 'sendVideo'
      : item.kind === 'ANIMATION'
        ? 'sendAnimation'
        : 'sendPhoto';
  const field =
    item.kind === 'VIDEO'
      ? 'video'
      : item.kind === 'ANIMATION'
        ? 'animation'
        : 'photo';
  return {
    method,
    body: {
      [field]: item.url,
      caption: caption.text,
      caption_entities: caption.entities,
    },
    expectedMessageCount: 1,
  };
}
