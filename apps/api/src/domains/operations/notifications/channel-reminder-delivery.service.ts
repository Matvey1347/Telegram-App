import { Injectable } from '@nestjs/common';
import {
  TelegramBotApiClient,
  TelegramBotApiError,
} from '@api/telegram/shared/bot/telegram-bot-api.client';
import { TelegramSystemBotConfigService } from '../../telegram/telegram-system-bot/telegram-system-bot-config.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  OperationsNotificationPermissionService,
  operationsNotificationMemberSelect,
} from './operations-notification-permission.service';
import { OperationsNotificationPublisherService } from './operations-notification-publisher.service';
import { OperationsNotificationStoreService } from './operations-notification-store.service';

/** A single aggregated occurrence, keyed by the domain's local-date occurrence. */
@Injectable()
export class ChannelReminderDeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: OperationsNotificationStoreService,
    private readonly publisher: OperationsNotificationPublisherService,
    private readonly permissions: OperationsNotificationPermissionService,
    private readonly bot: TelegramBotApiClient,
    private readonly config: TelegramSystemBotConfigService,
  ) {}

  async deliver(input: {
    workspaceId: string;
    memberId: string;
    sourceKey: string;
    title: string;
    body: string;
  }): Promise<void> {
    const member = await this.prisma.workspaceMember.findFirst({
      where: { id: input.memberId, workspaceId: input.workspaceId },
      select: {
        ...operationsNotificationMemberSelect,
        operationsNotificationPreference: {
          select: { channelRemindersTelegramEnabled: true },
        },
        user: {
          select: {
            telegramSystemBotConnection: {
              select: { enabled: true, telegramChatId: true },
            },
          },
        },
      },
    });
    if (
      !member ||
      !this.permissions.canReceive(member) ||
      !this.permissions.has(member, 'channels.view')
    )
      return;
    const key = {
      workspaceId: input.workspaceId,
      recipientMemberId: input.memberId,
      type: 'CHANNEL_POSTS_REMINDER' as const,
      sourceKey: input.sourceKey,
    };
    const created = await this.prisma.$transaction((tx) =>
      this.store.insertMany(tx, [
        {
          ...key,
          priority: 'NORMAL',
          copyKey: 'telegram.notification.channelPostsReminder',
          title: input.title,
          body: input.body,
          metadata: {},
          targetUrl: '/telegram-channels?tab=channels',
          requiredPermissionKey: 'channels.view',
        },
      ]),
    );
    const notification =
      created[0] ??
      (await this.prisma.operationsNotification.findUnique({
        where: { workspaceId_recipientMemberId_type_sourceKey: key },
        select: { id: true, channelReminderTelegramSentAt: true },
      }));
    if (!notification) return;
    // Publishing an existing occurrence recovers a crash after insertion. Push
    // claims are idempotent in the shared publisher.
    await this.publisher.publish([notification.id]);
    const connection = member.user.telegramSystemBotConnection;
    if (
      !member.operationsNotificationPreference
        ?.channelRemindersTelegramEnabled ||
      !connection?.enabled ||
      !this.config.token
    )
      return;
    const deliveryState = await this.prisma.operationsNotification.findUnique({
      where: { id: notification.id },
      select: { channelReminderTelegramSentAt: true },
    });
    if (!deliveryState || deliveryState.channelReminderTelegramSentAt) return;
    try {
      await this.bot.sendMessage(this.config.token, {
        chat_id: connection.telegramChatId,
        text: `${input.title}\n\n${input.body}`.slice(0, 4096),
      });
    } catch (error) {
      // Permanent Telegram rejections must not block other recipients forever.
      if (!(error instanceof TelegramBotApiError) || error.kind === 'TRANSIENT')
        throw error;
    }
    await this.prisma.operationsNotification.update({
      where: { id: notification.id },
      data: { channelReminderTelegramSentAt: new Date() },
    });
  }
}
