import { Api } from 'telegram';
import type {
  TelegramLeadChannelEvent,
  TelegramLeadPost,
} from './telegram-lead-channel.types';
import { telegramLongString } from './telegram-crm-mtproto.normalizer';

export function parseTelegramLeadPost(
  message: unknown,
  expectedChannelId?: string,
): TelegramLeadPost | null {
  if (
    !(message instanceof Api.Message) ||
    !(message.peerId instanceof Api.PeerChannel)
  )
    return null;
  const channelId = telegramLongString(message.peerId.channelId);
  if (expectedChannelId && channelId !== expectedChannelId) return null;
  if (
    !Number.isSafeInteger(message.id) ||
    message.id <= 0 ||
    !Number.isFinite(message.date)
  )
    return null;
  return {
    channelId,
    messageId: message.id,
    text: message.message ?? '',
    publishedAt: new Date(message.date * 1000),
    editedAt: message.editDate ? new Date(message.editDate * 1000) : null,
  };
}
export function normalizeTelegramLeadRaw(
  raw: unknown,
): TelegramLeadChannelEvent[] {
  const updates =
    raw instanceof Api.Updates || raw instanceof Api.UpdatesCombined
      ? raw.updates
      : raw instanceof Api.UpdateShort
        ? [raw.update]
        : [raw];
  if (updates.length > 1000) return [{ type: 'channel.gap', channelId: null }];
  return updates.flatMap((update): TelegramLeadChannelEvent[] => {
    if (update instanceof Api.UpdatesTooLong)
      return [{ type: 'channel.gap', channelId: null }];
    if (update instanceof Api.UpdateChannelTooLong)
      return [
        {
          type: 'channel.gap',
          channelId: telegramLongString(update.channelId),
        },
      ];
    if (
      update instanceof Api.UpdateNewChannelMessage ||
      update instanceof Api.UpdateEditChannelMessage
    ) {
      const post = parseTelegramLeadPost(update.message);
      if (
        !post ||
        !Number.isSafeInteger(update.pts) ||
        !Number.isSafeInteger(update.ptsCount)
      )
        return [];
      return [
        {
          type:
            update instanceof Api.UpdateNewChannelMessage
              ? 'post.new'
              : 'post.edited',
          post,
          pts: update.pts,
          ptsCount: update.ptsCount,
        },
      ];
    }
    if (update instanceof Api.UpdateDeleteChannelMessages) {
      if (update.messages.length > 1000)
        return [
          {
            type: 'channel.gap',
            channelId: telegramLongString(update.channelId),
          },
        ];
      return [
        {
          type: 'post.deleted',
          channelId: telegramLongString(update.channelId),
          messageIds: update.messages.filter(
            (id) => Number.isSafeInteger(id) && id > 0,
          ),
          pts: update.pts,
          ptsCount: update.ptsCount,
        },
      ];
    }
    return [];
  });
}
