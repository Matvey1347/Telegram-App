import { parseCrmOutgoingText } from './telegram-crm-chat-text';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Api, TelegramClient } from 'telegram';
import { returnBigInt } from 'telegram/Helpers';
import { CustomFile } from 'telegram/client/uploads';
import {
  extractTelegramCrmSentMessage,
  parseTelegramCrmMessage,
} from './telegram-crm-mtproto.normalizer';
import { crmMessageMedia } from './telegram-crm-message-metadata';
import {
  CRM_CHAT_MEDIA_LIMIT,
  validateCrmChatUpload,
} from './telegram-crm-chat-media';
import type {
  TelegramCrmChatActions,
  TelegramCrmChatPeer,
} from './telegram-crm-mtproto.types';

/** Operates on the existing client. No session, timer, media store or queued transfer. */
export class TelegramCrmChatActionTransport implements TelegramCrmChatActions {
  private static transfers = 0;
  constructor(private readonly client: TelegramClient) {}

  private peer(input: TelegramCrmChatPeer) {
    if (
      !/^\d+$/.test(input.telegramUserId) ||
      !/^-?\d+$/.test(input.telegramAccessHash)
    )
      throw new BadRequestException('INVALID_PRIVATE_PEER');
    return new Api.InputPeerUser({
      userId: returnBigInt(input.telegramUserId),
      accessHash: returnBigInt(input.telegramAccessHash),
    });
  }

  private async raw(
    input: TelegramCrmChatPeer & { telegramMessageId: number },
  ) {
    if (
      !Number.isSafeInteger(input.telegramMessageId) ||
      input.telegramMessageId < 1
    )
      throw new BadRequestException('INVALID_MESSAGE_ID');
    const rows = await this.client.getMessages(this.peer(input), {
      ids: [input.telegramMessageId],
    });
    const value = rows[0];
    if (!(value instanceof Api.Message) || value.id !== input.telegramMessageId)
      return null;
    const parsed = parseTelegramCrmMessage(value);
    if (!parsed || parsed.telegramUserId !== input.telegramUserId)
      throw new ForbiddenException('MESSAGE_PEER_MISMATCH');
    return value;
  }

  async getReadState(input: TelegramCrmChatPeer) {
    const result = await this.client.invoke(
      new Api.messages.GetPeerDialogs({
        peers: [new Api.InputDialogPeer({ peer: this.peer(input) })],
      }),
    );
    const dialog = result.dialogs.find(
      (row): row is Api.Dialog =>
        row instanceof Api.Dialog &&
        row.peer instanceof Api.PeerUser &&
        row.peer.userId.toString() === input.telegramUserId,
    );
    if (
      !dialog ||
      !Number.isSafeInteger(dialog.unreadCount) ||
      dialog.unreadCount < 0 ||
      !Number.isSafeInteger(result.state.pts) ||
      result.state.pts < 0 ||
      !Number.isSafeInteger(dialog.topMessage) ||
      dialog.topMessage < 0 ||
      !Number.isSafeInteger(dialog.readInboxMaxId) ||
      dialog.readInboxMaxId < 0
    )
      throw new Error('CHAT_DIALOG_READ_STATE_UNAVAILABLE');
    return {
      pts: result.state.pts,
      topMessageId: dialog.topMessage,
      unreadCount: dialog.unreadCount,
      readInboxMaxId: dialog.readInboxMaxId,
    };
  }

  async getMessage(input: Parameters<TelegramCrmChatActions['getMessage']>[0]) {
    const raw = await this.raw(input);
    return raw ? parseTelegramCrmMessage(raw) : null;
  }

  private async requireRaw(
    input: TelegramCrmChatPeer & { telegramMessageId: number },
  ) {
    const raw = await this.raw(input);
    if (!raw) throw new NotFoundException('TELEGRAM_MESSAGE_UNAVAILABLE');
    return raw;
  }

  async editText(input: Parameters<TelegramCrmChatActions['editText']>[0]) {
    const current = await this.requireRaw(input);
    if (!current.out || current.viaBotId || current.fwdFrom)
      throw new ForbiddenException('MESSAGE_NOT_EDITABLE');
    const [message, entities] = parseCrmOutgoingText(input.text);
    if (!message.trim() || message.length > (current.media ? 1024 : 4096))
      throw new BadRequestException('INVALID_MESSAGE_LENGTH');
    await this.client.invoke(
      new Api.messages.EditMessage({
        peer: this.peer(input),
        id: input.telegramMessageId,
        message,
        entities,
        noWebpage: false,
      }),
    );
    return (
      (await this.getMessage(input)) ??
      Promise.reject(new Error('CHAT_MUTATION_RESULT_UNKNOWN'))
    );
  }

  async deleteMessages(
    input: Parameters<TelegramCrmChatActions['deleteMessages']>[0],
  ) {
    if (
      !input.telegramMessageIds.length ||
      input.telegramMessageIds.length > 50
    )
      throw new BadRequestException('INVALID_DELETE_BATCH');
    for (const telegramMessageId of input.telegramMessageIds)
      await this.requireRaw({ ...input, telegramMessageId });
    await this.client.invoke(
      new Api.messages.DeleteMessages({
        id: input.telegramMessageIds,
        revoke: input.revoke,
      }),
    );
    return { confirmed: true as const };
  }

  async setReaction(
    input: Parameters<TelegramCrmChatActions['setReaction']>[0],
  ) {
    await this.requireRaw(input);
    if (
      input.emoji !== null &&
      (!input.emoji.trim() || input.emoji.length > 64)
    )
      throw new BadRequestException('INVALID_REACTION');
    const reaction =
      input.emoji === null
        ? []
        : /^custom:\d+$/.test(input.emoji)
          ? [
              new Api.ReactionCustomEmoji({
                documentId: returnBigInt(input.emoji.slice(7)),
              }),
            ]
          : [new Api.ReactionEmoji({ emoticon: input.emoji })];
    await this.client.invoke(
      new Api.messages.SendReaction({
        peer: this.peer(input),
        msgId: input.telegramMessageId,
        reaction,
      }),
    );
    return (
      (await this.getMessage(input)) ??
      Promise.reject(new Error('CHAT_MUTATION_RESULT_UNKNOWN'))
    );
  }

  async forwardMessage(
    input: Parameters<TelegramCrmChatActions['forwardMessage']>[0],
  ) {
    const current = await this.requireRaw({
      ...input.origin,
      telegramMessageId: input.telegramMessageId,
    });
    if (current.noforwards) throw new ForbiddenException('PROTECTED_CONTENT');
    const result = await this.client.invoke(
      new Api.messages.ForwardMessages({
        fromPeer: this.peer(input.origin),
        toPeer: this.peer(input.destination),
        id: [input.telegramMessageId],
        randomId: [returnBigInt(input.randomId)],
      }),
    );
    const message = extractTelegramCrmSentMessage(
      result,
      input.destination.telegramUserId,
    );
    if (!message || message.telegramUserId !== input.destination.telegramUserId)
      throw new Error('FORWARD_RESULT_UNKNOWN');
    return message;
  }

  private async transfer<T>(operation: () => Promise<T>) {
    if (TelegramCrmChatActionTransport.transfers >= 2)
      throw new ConflictException('CHAT_TRANSFER_BUSY');
    TelegramCrmChatActionTransport.transfers++;
    try {
      return await operation();
    } finally {
      TelegramCrmChatActionTransport.transfers--;
    }
  }

  async sendMedia(input: Parameters<TelegramCrmChatActions['sendMedia']>[0]) {
    const { duration } = validateCrmChatUpload(input);
    const peer = this.peer(input);
    const [message, entities] = parseCrmOutgoingText(input.caption ?? '');
    if (message.length > 1024)
      throw new BadRequestException('INVALID_CAPTION_LENGTH');
    if (input.replyToTelegramMessageId)
      await this.requireRaw({
        ...input,
        telegramMessageId: input.replyToTelegramMessageId,
      });
    return this.transfer(async () => {
      const file = await this.client.uploadFile({
        file: new CustomFile(input.fileName, input.data.length, '', input.data),
        workers: 1,
      });
      const media =
        input.kind === 'IMAGE'
          ? new Api.InputMediaUploadedPhoto({ file })
          : new Api.InputMediaUploadedDocument({
              file,
              mimeType: input.mimeType.split(';', 1)[0].trim().toLowerCase(),
              attributes: [
                new Api.DocumentAttributeFilename({ fileName: input.fileName }),
                ...(input.kind === 'VOICE'
                  ? [
                      new Api.DocumentAttributeAudio({
                        voice: true,
                        duration: duration!,
                      }),
                    ]
                  : []),
              ],
              forceFile: input.kind === 'FILE',
            });
      const result = await this.client.invoke(
        new Api.messages.SendMedia({
          peer,
          media,
          message,
          entities,
          randomId: returnBigInt(input.randomId),
          ...(input.replyToTelegramMessageId
            ? {
                replyTo: new Api.InputReplyToMessage({
                  replyToMsgId: input.replyToTelegramMessageId,
                }),
              }
            : {}),
        }),
      );
      const sent = extractTelegramCrmSentMessage(result, input.telegramUserId);
      if (!sent || sent.telegramUserId !== input.telegramUserId)
        throw new Error('MEDIA_SEND_RESULT_UNKNOWN');
      // ShortSent acknowledgements omit authoritative media metadata. Resolve the
      // actual returned ID before presenting a downloadable attachment.
      if (!sent.contentMetadata?.media) {
        const refreshed = await this.getMessage({
          ...input,
          telegramMessageId: sent.telegramMessageId,
        });
        if (!refreshed?.contentMetadata?.media)
          throw new Error('MEDIA_SEND_RESULT_UNKNOWN');
        return refreshed;
      }
      return sent;
    });
  }

  async downloadMedia(
    input: Parameters<TelegramCrmChatActions['downloadMedia']>[0],
  ) {
    const current = await this.requireRaw(input);
    const media = crmMessageMedia(current.media);
    const limit = Math.min(CRM_CHAT_MEDIA_LIMIT, input.maxBytes);
    if (!Number.isSafeInteger(limit) || limit < 1)
      throw new BadRequestException('INVALID_DOWNLOAD_LIMIT');
    if (
      !media ||
      !current.media ||
      current.noforwards ||
      ('ttlSeconds' in current.media && current.media.ttlSeconds)
    )
      throw new ForbiddenException('MEDIA_UNAVAILABLE');
    if (
      !Number.isSafeInteger(media.size) ||
      media.size <= 0 ||
      media.size > limit
    )
      throw new PayloadTooLargeException('CHAT_MEDIA_LIMIT_10_MIB');
    return this.transfer(async () => {
      const iterator = this.client.iterDownload({
        file: current.media,
        requestSize: 64 * 1024,
        chunkSize: 64 * 1024,
        msgData: [this.peer(input), input.telegramMessageId],
      });
      const chunks: Buffer[] = [];
      let size = 0;
      try {
        for await (const chunk of iterator) {
          size += chunk.length;
          if (size > limit)
            throw new PayloadTooLargeException('CHAT_MEDIA_LIMIT_10_MIB');
          chunks.push(chunk);
        }
      } finally {
        await iterator.close();
      }
      return {
        data: Buffer.concat(chunks, size),
        fileName: media.fileName,
        mimeType: media.mimeType,
      };
    });
  }
}
