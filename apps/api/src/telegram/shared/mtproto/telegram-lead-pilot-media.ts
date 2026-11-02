import {
  BadRequestException,
  ForbiddenException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Api, TelegramClient } from 'telegram';
import { crmMessageMedia } from './telegram-crm-message-metadata';
import { parseTelegramLeadPost } from './telegram-lead-channel-normalizer';

/** Uses an already-owned MTProto client and a verified channel peer; never marks read. */
export async function readLeadPilotMedia(
  client: TelegramClient,
  peer: Api.InputPeerChannel,
  messageId: number,
  maxBytes: number,
) {
  if (
    !Number.isSafeInteger(messageId) ||
    messageId < 1 ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > 5 * 1024 * 1024
  )
    throw new BadRequestException('LEAD_MEDIA_LIMIT_INVALID');
  const rows = await client.getMessages(peer, { ids: [messageId] });
  const message = rows[0];
  if (
    !(message instanceof Api.Message) ||
    message.id !== messageId ||
    !(message.peerId instanceof Api.PeerChannel) ||
    message.peerId.channelId.toString() !== peer.channelId.toString()
  )
    throw new ForbiddenException('LEAD_MEDIA_MESSAGE_UNAVAILABLE');
  const media = crmMessageMedia(message.media);
  if (
    !media ||
    !message.media ||
    !(message.media instanceof Api.MessageMediaPhoto) ||
    message.noforwards ||
    ('ttlSeconds' in message.media && message.media.ttlSeconds) ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(media.mimeType)
  )
    throw new ForbiddenException('LEAD_MEDIA_UNAVAILABLE');
  if (
    !Number.isSafeInteger(media.size) ||
    media.size < 1 ||
    media.size > maxBytes
  )
    throw new PayloadTooLargeException('LEAD_MEDIA_TOO_LARGE');
  const iterator = client.iterDownload({
    file: message.media,
    requestSize: 64 * 1024,
    chunkSize: 64 * 1024,
    msgData: [peer, messageId],
  });
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of iterator) {
      size += chunk.length;
      if (size > maxBytes)
        throw new PayloadTooLargeException('LEAD_MEDIA_TOO_LARGE');
      chunks.push(chunk);
    }
    const post = parseTelegramLeadPost(message, peer.channelId.toString());
    if (!post) throw new ForbiddenException('LEAD_MEDIA_MESSAGE_UNAVAILABLE');
    return { data: Buffer.concat(chunks, size), mime: media.mimeType, post };
  } finally {
    for (const chunk of chunks) chunk.fill(0);
    await iterator.close();
  }
}
