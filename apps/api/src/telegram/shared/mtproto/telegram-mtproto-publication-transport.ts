import { assertScheduledCancellationAck } from './telegram-scheduled-cancellation-ack';
import {
  publishTelegramPost,
  type TelegramPublishPostParams,
} from './telegram-mtproto-publish-post';
import { completeTelegramScheduledMessages } from './telegram-history-cutoff';
import {
  withTelegramPublicationDeadline,
  withTelegramReadDeadline,
} from './telegram-publication-deadline';
import { BadRequestException } from '@nestjs/common';
import { Api, TelegramClient } from 'telegram';
import { returnBigInt } from 'telegram/Helpers';
import { HTMLParser } from 'telegram/extensions/html';
import { telegramHtmlToMtprotoHtml } from '@api/telegram/shared/markup/telegram-markup';
import {
  convertTelegramPublishImageWithSips,
  downloadTelegramPublishImage,
} from '@api/telegram/shared/mtproto/telegram-mtproto-publish-image';
import {
  type StoredTelegramChannelReference,
  type TelegramScheduledMessage,
  type TelegramManagedPostHistory,
} from './telegram-mtproto-client-types';
import type { TelegramMtprotoClient } from './telegram-mtproto.client';

type Dependencies = {
  closeClient: TelegramMtprotoClient['closeClient'];
  createClient: TelegramMtprotoClient['createClient'];
  getChannelMessagesFromCutoff: TelegramMtprotoClient['getChannelMessagesFromCutoff'];
  resolveStoredChannel: TelegramMtprotoClient['resolveStoredChannel'];
  telegramMetadataTimeoutMs: TelegramMtprotoClient['telegramMetadataTimeoutMs'];
  telegramResolveTimeoutMs: TelegramMtprotoClient['telegramResolveTimeoutMs'];
  toTelegramDate: TelegramMtprotoClient['toTelegramDate'];
  withTimeout: TelegramMtprotoClient['withTimeout'];
  downloadPublishImage: TelegramMtprotoClient['downloadPublishImage'];
  convertImageBufferWithSips: TelegramMtprotoClient['convertImageBufferWithSips'];
};

export class TelegramMtprotoPublicationTransport {
  constructor(private readonly context: Dependencies) {}

  private parseMtprotoHtml(html: string) {
    const [text, entities] = HTMLParser.parse(telegramHtmlToMtprotoHtml(html));
    return { text, entities };
  }

  private isMessageNotModifiedError(error: unknown) {
    const message = String(
      (error as { errorMessage?: string | null })?.errorMessage ||
        (error as { message?: string | null })?.message ||
        '',
    ).toUpperCase();
    return message.includes('MESSAGE_NOT_MODIFIED');
  }

  private async sendTextMessageWithEntities(
    client: TelegramClient,
    entity: unknown,
    html: string,
    schedule?: number,
  ) {
    const { text, entities } = this.parseMtprotoHtml(html);
    if (!text) return null;
    const peer = await client.getInputEntity(entity as never);
    const request = new Api.messages.SendMessage({
      peer,
      message: text,
      entities,
      scheduleDate: schedule,
    });
    const result = await client.invoke(request);
    return (
      client as unknown as {
        _getResponseMessage: (
          request: Api.messages.SendMessage,
          result: unknown,
          inputChat: unknown,
        ) => Api.Message | undefined;
      }
    )._getResponseMessage(request, result, peer);
  }

  private async editMessageWithEntities(
    client: TelegramClient,
    peerRef: unknown,
    messageId: string | number,
    html: string,
    scheduleAt?: Date | null,
  ) {
    const { text, entities } = this.parseMtprotoHtml(html);
    try {
      await client.invoke(
        new Api.messages.EditMessage({
          peer: await client.getInputEntity(peerRef as never),
          id: Number(messageId),
          message: text,
          entities,
          scheduleDate: scheduleAt
            ? Math.floor(scheduleAt.getTime() / 1000)
            : undefined,
        }),
      );
      return true;
    } catch (error) {
      if (this.isMessageNotModifiedError(error)) return false;
      throw error;
    }
  }

  publishPost(params: TelegramPublishPostParams) {
    return publishTelegramPost(
      {
        create: (credentials, signal) =>
          this.context.createClient(credentials, signal),
        close: (client) => this.context.closeClient(client),
        resolve: (client, channel) =>
          this.context.resolveStoredChannel(client, channel),
        parse: (html) => this.parseMtprotoHtml(html),
        downloadImage: (url, index) =>
          this.context.downloadPublishImage(url, index),
        sendText: (client, entity, html, schedule) =>
          this.sendTextMessageWithEntities(client, entity, html, schedule),
        serialize: (message, isScheduled) =>
          this.serializeManagedPostMessage(message, isScheduled),
      },
      params,
    );
  }

  async editPostText(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef?: string;
    channel?: StoredTelegramChannelReference;
    messageIds: string[];
    imageCount: number;
    publishMode: string | null | undefined;
    captionHtml?: string;
    followupHtmlParts?: string[];
    textHtmlParts?: string[];
    scheduleAt?: Date | null;
  }) {
    const client = await this.context.createClient(params);
    let updatedCount = 0;
    let unchangedCount = 0;
    try {
      const resolved = params.channel
        ? await this.context.resolveStoredChannel(client, params.channel)
        : null;
      if (
        resolved &&
        !resolved.channel.isCreator &&
        !resolved.channel.adminRights?.editMessages
      )
        throw new BadRequestException(
          'The selected Telegram account no longer has edit rights.',
        );
      const peerRef = resolved?.entity || params.channelRef;
      const mediaMessageIds = params.messageIds.slice(0, params.imageCount);
      const followupMessageIds = params.messageIds.slice(params.imageCount);
      if (params.imageCount > 0) {
        const captionUpdated = await this.editMessageWithEntities(
          client,
          peerRef,
          mediaMessageIds[0],
          params.captionHtml ?? '',
          params.scheduleAt,
        );
        if (captionUpdated) updatedCount += 1;
        else unchangedCount += 1;
        for (let index = 0; index < followupMessageIds.length; index += 1) {
          const messageUpdated = await this.editMessageWithEntities(
            client,
            peerRef,
            followupMessageIds[index],
            params.followupHtmlParts?.[index] ?? '',
            params.scheduleAt,
          );
          if (messageUpdated) updatedCount += 1;
          else unchangedCount += 1;
        }
        return { updatedCount, unchangedCount };
      }
      for (let index = 0; index < params.messageIds.length; index += 1) {
        const messageUpdated = await this.editMessageWithEntities(
          client,
          peerRef,
          params.messageIds[index],
          params.textHtmlParts?.[index] ?? '',
          params.scheduleAt,
        );
        if (messageUpdated) updatedCount += 1;
        else unchangedCount += 1;
      }
      return { updatedCount, unchangedCount };
    } finally {
      await this.context.closeClient(client);
    }
  }

  async editPostPhotos(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef?: string;
    channel?: StoredTelegramChannelReference;
    messageIds: string[];
    imageUrls: string[];
    scheduleAt?: Date | null;
  }) {
    if (params.messageIds.length !== params.imageUrls.length) {
      throw new Error(
        'Telegram media replacement requires the same number of image messages',
      );
    }
    const client = await this.context.createClient(params);
    try {
      const resolved = params.channel
        ? await this.context.resolveStoredChannel(client, params.channel)
        : null;
      if (
        resolved &&
        !resolved.channel.isCreator &&
        !resolved.channel.adminRights?.editMessages
      )
        throw new BadRequestException(
          'The selected Telegram account no longer has edit rights.',
        );
      const peer = await client.getInputEntity(
        (resolved?.entity || params.channelRef) as never,
      );
      for (let index = 0; index < params.imageUrls.length; index += 1) {
        const file = await client.uploadFile({
          file: await this.context.downloadPublishImage(
            params.imageUrls[index],
            index,
          ),
          workers: 1,
        });
        await client.invoke(
          new Api.messages.EditMessage({
            peer,
            id: Number(params.messageIds[index]),
            media: new Api.InputMediaUploadedPhoto({ file }),
            scheduleDate: params.scheduleAt
              ? Math.floor(params.scheduleAt.getTime() / 1000)
              : undefined,
          }),
        );
      }
    } finally {
      await this.context.closeClient(client);
    }
  }

  convertImageBufferWithSips(buffer: Buffer, contentType: string) {
    return convertTelegramPublishImageWithSips(buffer, contentType);
  }

  downloadPublishImage(url: string, index: number) {
    return downloadTelegramPublishImage(url, index, (buffer, contentType) =>
      this.context.convertImageBufferWithSips(buffer, contentType),
    );
  }

  async deleteScheduledPost(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef?: string;
    channel?: StoredTelegramChannelReference;
    messageIds: string[];
    scheduleAt?: Date;
  }) {
    return withTelegramPublicationDeadline({
      timeoutMs: 60_000,
      scheduleAt: params.scheduleAt,
      create: (signal) => this.context.createClient(params, signal),
      close: (client) => this.context.closeClient(client),
      run: async (client, checkpoint) => {
        const resolved = params.channel
          ? await this.context.resolveStoredChannel(client, params.channel)
          : null;
        const peer =
          resolved?.peer ||
          (await client.getInputEntity(params.channelRef as string));
        checkpoint();
        const result = await client.invoke(
          new Api.messages.DeleteScheduledMessages({
            peer,
            id: params.messageIds.map(Number).filter(Number.isFinite),
          }),
        );
        if (params.scheduleAt)
          assertScheduledCancellationAck(result, peer, params.messageIds);
      },
    });
  }

  async deletePublishedMessages(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef?: string;
    channel?: StoredTelegramChannelReference;
    messageIds: string[];
  }) {
    const client = await this.context.createClient(params);
    try {
      const deleteFrom = async (channel?: StoredTelegramChannelReference) => {
        const resolved = channel ? await this.context.resolveStoredChannel(client, channel) : null;
        if (resolved && !resolved.channel.isCreator && !resolved.channel.adminRights?.deleteMessages) {
          throw new BadRequestException('The selected Telegram account no longer has delete rights.');
        }
        const peer = resolved?.peer ?? await client.getInputEntity(params.channelRef as string);
        await client.invoke(new Api.channels.DeleteMessages({
          channel: peer,
          id: params.messageIds.map(Number).filter(Number.isFinite),
        }));
      };
      try {
        await deleteFrom(params.channel);
      } catch (error) {
        // The API explicitly rejected the peer. Resolve the same channel for
        // this account before a single retry with the exact same message IDs.
        if (!params.channel?.telegramAccessHash || (error as { errorMessage?: string })?.errorMessage !== 'CHANNEL_INVALID')
          throw error;
        await deleteFrom({ ...params.channel, telegramAccessHash: null });
      }
    } finally {
      await this.context.closeClient(client);
    }
  }

  async getManagedPostMessages(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef?: string;
    channel?: StoredTelegramChannelReference;
    publishedMessageIds: string[];
    scheduledMessageIds: string[];
    recentPublishedFrom?: Date;
    recentPublishedUntil?: Date;
  }): Promise<TelegramManagedPostHistory> {
    return withTelegramReadDeadline({
      timeoutMs: 60_000,
      label: 'Telegram managed-post reconciliation read',
      create: (signal) => this.context.createClient(params, signal),
      close: (client) => this.context.closeClient(client),
      run: async (client) => {
        const resolved = params.channel
          ? await this.context.resolveStoredChannel(client, params.channel)
          : null;
        const entity = resolved
          ? resolved.entity
          : await this.context.withTimeout(
              client.getEntity(params.channelRef as string),
              this.context.telegramResolveTimeoutMs,
              'Telegram managed-post channel lookup',
            );
        const peer =
          resolved?.peer ||
          (await this.context.withTimeout(
            client.getInputEntity(params.channelRef as string),
            this.context.telegramResolveTimeoutMs,
            'Telegram managed-post peer lookup',
          ));
        const publishedIds = params.publishedMessageIds
          .map(Number)
          .filter(Number.isFinite);
        const scheduledIds = params.scheduledMessageIds
          .map(Number)
          .filter(Number.isFinite);
        const published = publishedIds.length
          ? await this.context.withTimeout(
              client.getMessages(entity, { ids: publishedIds }),
              this.context.telegramMetadataTimeoutMs,
              'Telegram managed-post identity lookup',
            )
          : [];
        let recentPublishedComplete = false;
        const recentPublished = params.recentPublishedFrom
          ? await this.context.getChannelMessagesFromCutoff(client, entity, {
              postLimit: 500,
              postsFrom: params.recentPublishedFrom,
              beforeDate: params.recentPublishedUntil,
              onComplete: (complete) => {
                recentPublishedComplete = complete;
              },
            })
          : await this.context.withTimeout(
              client.getMessages(entity, { limit: 200 }),
              this.context.telegramMetadataTimeoutMs,
              'Telegram recent-post identity lookup',
            );
        const scheduledResult = scheduledIds.length
          ? await this.context.withTimeout(
              client.invoke(
                new Api.messages.GetScheduledMessages({
                  peer,
                  id: scheduledIds,
                }),
              ),
              this.context.telegramMetadataTimeoutMs,
              'Telegram scheduled-message identity lookup',
            )
          : null;
        const scheduled = Array.isArray((scheduledResult as any)?.messages)
          ? (scheduledResult as any).messages
          : [];
        const serialize = (message: any, isScheduled: boolean) =>
          this.serializeManagedPostMessage(message, isScheduled);
        return {
          published: (published as any[])
            .filter((message) => message?.id && message?.date)
            .map((message) => serialize(message, false)),
          recentPublishedComplete,
          recentPublished: recentPublished
            .filter((message) => message?.id && message?.date)
            .map((message) => serialize(message, false)),
          scheduled: (scheduled as any[])
            .filter((message) => message?.id && message?.date)
            .map((message) => serialize(message, true)),
        };
      },
    });
  }

  async getScheduledHistory(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef?: string;
    channel?: StoredTelegramChannelReference;
    requireDeletionAccess?: boolean;
  }): Promise<TelegramScheduledMessage[]> {
    return withTelegramReadDeadline({
      timeoutMs: this.context.telegramMetadataTimeoutMs,
      label: 'Telegram scheduled-history lookup',
      create: (signal) => this.context.createClient(params, signal),
      close: (client) => this.context.closeClient(client),
      run: async (client) => {
        const resolved = params.channel
          ? await this.context.resolveStoredChannel(client, params.channel)
          : null;
        if (
          params.requireDeletionAccess &&
          !resolved?.channel.isCreator &&
          !resolved?.channel.adminRights?.deleteMessages
        )
          throw new BadRequestException(
            'The pinned Telegram account no longer has deletion rights.',
          );
        const peer =
          resolved?.peer ||
          (await client.getInputEntity(params.channelRef as string));
        const result = await client.invoke(
          new Api.messages.GetScheduledHistory({
            peer,
            hash: returnBigInt(0),
          }),
        );
        return completeTelegramScheduledMessages(result).map((message) =>
          this.serializeManagedPostMessage(message, true),
        );
      },
    });
  }

  async getScheduledMessagesByIds(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef?: string;
    channel?: StoredTelegramChannelReference;
    messageIds: string[];
    requireCompleteResponse?: boolean;
  }): Promise<TelegramScheduledMessage[]> {
    const messageIds = [...new Set(params.messageIds)]
      .map(Number)
      .filter(Number.isSafeInteger);
    if (!messageIds.length) return [];
    return withTelegramReadDeadline({
      // This lookup opens an MTProto session and can be slower than other
      // metadata reads on production accounts. Keep the deadline scoped to
      // this operation; callers also limit each request to a small ID batch.
      timeoutMs: Math.max(this.context.telegramMetadataTimeoutMs, 30_000),
      label: 'Telegram scheduled-message lookup',
      create: (signal) => this.context.createClient(params, signal),
      close: (client) => this.context.closeClient(client),
      run: async (client) => {
        const resolved = params.channel
          ? await this.context.resolveStoredChannel(client, params.channel, params.requireCompleteResponse === true)
          : null;
        const peer =
          resolved?.peer ||
          (await client.getInputEntity(params.channelRef as string));
        const result = await client.invoke(
          new Api.messages.GetScheduledMessages({ peer, id: messageIds }),
        );
        if (params.requireCompleteResponse) {
          return completeTelegramScheduledMessages(result).flatMap((message) => {
            if (message instanceof Api.MessageEmpty) return [];
            if (!(message instanceof Api.Message) || !messageIds.includes(message.id)) {
              throw new Error('Telegram returned an unexpected scheduled message');
            }
            return [this.serializeManagedPostMessage(message, true)];
          });
        }
        const messages = Array.isArray((result as any)?.messages)
          ? (result as any).messages
          : [];
        return (
          messages
            // Telegram omits `date` on scheduled messages.getScheduledMessages
            // results in GramJS. Reconciliation relies on the stored message ID.
            .filter((message) => message?.id != null)
            .map((message) => this.serializeManagedPostMessage(message, true))
        );
      },
    });
  }

  private serializeManagedPostMessage(
    message: any,
    isScheduled: boolean,
  ): TelegramScheduledMessage & { isScheduled: boolean } {
    return {
      id: String(message.id),
      text: String(message.message || ''),
      html: HTMLParser.unparse(
        String(message.message || ''),
        message.entities || [],
      ),
      date: this.context.toTelegramDate(message.date)?.toISOString() ?? null,
      isScheduled,
      hasMedia: Boolean(message.media),
      mediaKind: message.media?.className
        ? String(message.media.className)
        : null,
      groupedId: message.groupedId != null ? String(message.groupedId) : null,
    };
  }
}
