import { Injectable } from '@nestjs/common';
import { TelegramSourceType } from '@prisma/client';
import { TelegramBotApiClient } from '../../../telegram/shared/telegram-bot-api.client';
import { isTelegramMessageAlreadyAbsent } from '../../../telegram/shared/telegram-deletion-policy';
import { TelegramMtprotoClient } from '../../../telegram/shared/telegram-mtproto.client';
import { TelegramChannelAccessService } from './telegram-channel-access.service';

const BOT_DELETE_BATCH_SIZE = 100;

export type ManagedPostDeletionSource = {
  sourceId: string;
  sourceType: TelegramSourceType;
  permissions: { canDeleteMessages: boolean };
};

type DeletionChannel = {
  username: string | null;
  telegramChatId: string | null;
  inviteLink: string | null;
  telegramAccessHash: string | null;
};

@Injectable()
export class TelegramManagedPostRemoteDeleteExecutor {
  constructor(
    private readonly access: TelegramChannelAccessService,
    private readonly botApi: TelegramBotApiClient,
    private readonly mtproto: TelegramMtprotoClient,
  ) {}

  async deleteMessages(input: {
    workspaceId: string;
    channelId: string;
    channel: DeletionChannel;
    source: ManagedPostDeletionSource;
    sources: ManagedPostDeletionSource[];
    rawMessageIds: string[];
  }) {
    const messageIds = [
      ...new Set(input.rawMessageIds.map(Number).filter(Number.isSafeInteger)),
    ];
    const noFailures = new Map<number, string>();
    if (!messageIds.length) return noFailures;
    if (input.source.sourceType === TelegramSourceType.BOT) {
      try {
        await this.deleteViaBot(
          input.workspaceId,
          input.channel,
          input.source.sourceId,
          messageIds,
        );
        return noFailures;
      } catch (error) {
        const fallback = input.sources.find(
          (source) =>
            source.sourceType === TelegramSourceType.MTPROTO &&
            source.permissions.canDeleteMessages,
        );
        if (!fallback) throw error;
        return this.deleteViaMtprotoWithIsolation(input, fallback, messageIds);
      }
    }
    return this.deleteViaMtprotoWithIsolation(input, input.source, messageIds);
  }

  private async deleteViaBot(
    workspaceId: string,
    channel: DeletionChannel,
    sourceId: string,
    messageIds: number[],
  ) {
    const token = await this.access.botTokenForSource(workspaceId, sourceId);
    const chatId = this.access.botChatId(channel);
    if (!chatId) throw new Error('Channel has no Telegram chat reference');
    for (
      let index = 0;
      index < messageIds.length;
      index += BOT_DELETE_BATCH_SIZE
    ) {
      const batch = messageIds.slice(index, index + BOT_DELETE_BATCH_SIZE);
      try {
        await this.botApi.call<boolean>(token, 'deleteMessages', {
          chat_id: chatId,
          message_ids: batch,
        });
      } catch (bulkError) {
        if (isTelegramMessageAlreadyAbsent(bulkError)) continue;
        for (const messageId of batch) {
          try {
            await this.botApi.deleteMessage(token, {
              chat_id: chatId,
              message_id: messageId,
            });
          } catch (error) {
            if (!isTelegramMessageAlreadyAbsent(error, { singleMessage: true }))
              throw error;
          }
        }
      }
    }
  }

  private async deleteViaMtprotoWithIsolation(
    input: {
      workspaceId: string;
      channelId: string;
      channel: DeletionChannel;
    },
    source: ManagedPostDeletionSource,
    messageIds: number[],
  ) {
    const account = await this.access.connectedAccount(
      input.workspaceId,
      input.channelId,
      source.sourceId,
    );
    const request = (ids: number[]) =>
      this.mtproto.deletePublishedMessages({
        ...this.access.accountCredentials(account),
        channel: this.access.mtprotoChannelReference(input.channel),
        messageIds: ids.map(String),
      });
    try {
      await request(messageIds);
      return new Map<number, string>();
    } catch (bulkError) {
      if (!isTelegramMessageAlreadyAbsent(bulkError, { singleMessage: true }))
        throw bulkError;
    }
    const failures = new Map<number, string>();
    for (const messageId of messageIds) {
      try {
        await request([messageId]);
      } catch (error) {
        if (isTelegramMessageAlreadyAbsent(error, { singleMessage: true }))
          continue;
        failures.set(
          messageId,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    return failures;
  }
}
