import { Injectable } from '@nestjs/common';
import { TelegramUserAccountStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  TelegramMtprotoClient,
  type TelegramScheduledMessage,
} from '@api/telegram/shared/mtproto/telegram-mtproto.client';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import { TelegramChannelAccessService } from './telegram-channel-access.service';
import { telegramChannelNotFound } from './telegram-posts.errors';

function messageSummary(message: TelegramScheduledMessage) {
  return {
    id: message.id,
    text: message.text,
    date: message.date,
    hasMedia: message.hasMedia,
    groupedId: message.groupedId,
  };
}

type AccountSnapshot = {
  accountId: string;
  scheduledMessages: ReturnType<typeof messageSummary>[];
  error?: string;
};

/** Explicit read-only recovery evidence: no import, media download or mutation. */
@Injectable()
export class TelegramManagedPostRecoverySnapshotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mtprotoClient: TelegramMtprotoClient,
    private readonly support: TelegramChannelsSupportService,
    private readonly access: TelegramChannelAccessService,
  ) {}

  async snapshot(userId: string, channelId: string) {
    const workspaceId = await this.support.workspace(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId, isActive: true },
      select: {
        id: true,
        username: true,
        telegramChatId: true,
        inviteLink: true,
        telegramAccessHash: true,
      },
    });
    if (!channel) throw telegramChannelNotFound();
    const [links, oldest] = await Promise.all([
      this.prisma.telegramChannelAdminLink.findMany({
        where: {
          workspaceId,
          telegramChannelId: channelId,
          telegramUserAccountIntegration: {
            workspaceId,
            isActive: true,
            status: TelegramUserAccountStatus.connected,
          },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          telegramUserAccountIntegration: {
            select: {
              id: true,
              apiId: true,
              apiHashEncrypted: true,
              apiHashIv: true,
              apiHashAuthTag: true,
              sessionEncrypted: true,
              sessionIv: true,
              sessionAuthTag: true,
            },
          },
        },
      }),
      this.prisma.telegramManagedPost.aggregate({
        where: {
          workspaceId,
          telegramChannelId: channelId,
          status: { in: ['SCHEDULED', 'FAILED'] },
        },
        _min: { createdAt: true },
      }),
    ]);
    const now = new Date();
    const channelReference = this.access.mtprotoChannelReference(channel);
    const accounts: AccountSnapshot[] = [];
    let reader:
      | ReturnType<TelegramChannelAccessService['accountCredentials']>
      | undefined;
    for (const { telegramUserAccountIntegration: account } of links) {
      const observation: AccountSnapshot = {
        accountId: account.id,
        scheduledMessages: [],
      };
      accounts.push(observation);
      try {
        const credentials = this.access.accountCredentials(account);
        reader ??= credentials;
        const scheduled = await this.mtprotoClient.getScheduledHistory({
          ...credentials,
          channel: channelReference,
        });
        observation.scheduledMessages = scheduled.map(messageSummary);
      } catch {
        // Never echo transport/decryption exceptions: they can contain secrets.
        observation.error =
          'Telegram scheduled queue could not be read; absence is unverified.';
      }
    }
    let publishedMessages: ReturnType<typeof messageSummary>[] = [];
    let publishedHistoryComplete = false;
    let publishedHistoryError: string | undefined;
    if (reader) {
      try {
        const history = await this.mtprotoClient.getManagedPostMessages({
          ...reader,
          channel: channelReference,
          publishedMessageIds: [],
          scheduledMessageIds: [],
          recentPublishedFrom:
            oldest._min.createdAt ?? new Date(now.getTime() - 7 * 86_400_000),
          recentPublishedUntil: now,
        });
        publishedMessages = history.recentPublished.map(messageSummary);
        publishedHistoryComplete = history.recentPublishedComplete === true;
      } catch {
        publishedHistoryError =
          'Telegram published history could not be read; publication status is unverified.';
      }
    } else {
      publishedHistoryError =
        'No connected linked Telegram account could read published history.';
    }
    return {
      channelId,
      observedAt: new Date().toISOString(),
      accounts,
      publishedMessages,
      publishedHistoryComplete,
      ...(publishedHistoryError ? { publishedHistoryError } : {}),
    };
  }
}
