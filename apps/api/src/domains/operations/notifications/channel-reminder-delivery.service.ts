import { Injectable, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { TelegramSystemBotNotificationsService } from '../../telegram/telegram-system-bot/telegram-system-bot-notifications.service';
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
    @Optional() private readonly moduleRef?: ModuleRef,
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
    if (!this.moduleRef) return;
    const alreadySent = await this.prisma.operationsNotification.findFirst({
      where: {
        workspaceId: input.workspaceId,
        type: 'CHANNEL_POSTS_REMINDER',
        sourceKey: input.sourceKey,
        channelReminderTelegramSentAt: { not: null },
      },
      select: { id: true },
    });
    if (alreadySent) return;
    const botNotifications = await this.moduleRef.resolve(
      TelegramSystemBotNotificationsService,
      undefined,
      { strict: false },
    );
    const result = await botNotifications.sendToWorkspace(
      input.workspaceId,
      `${input.title}\n\n${input.body}`.slice(0, 4096),
    );
    if (result.status !== 'SENT') return;
    await this.prisma.operationsNotification.update({
      where: { id: notification.id },
      data: { channelReminderTelegramSentAt: new Date() },
    });
  }
}
