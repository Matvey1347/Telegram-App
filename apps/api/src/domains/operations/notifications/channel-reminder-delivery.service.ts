import { Injectable, Optional } from '@nestjs/common';
import type { PublicationNotificationDestination } from '@telegram-system/shared';
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
    telegramHtml?: string;
    destination?: PublicationNotificationDestination;
  }): Promise<boolean | void> {
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
    if (input.destination && input.destination !== 'IN_APP') {
      const result = await this.sendTelegram(
        input,
        input.destination === 'TELEGRAM_PRIVATE',
      );
      return result?.status === 'SENT';
    }
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
          metadata: input.destination === 'IN_APP' ? { inAppOnly: true } : {},
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
    if (!this.moduleRef || input.destination === 'IN_APP') return;
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
    const result = await this.sendTelegram(input, false);
    if (result?.status !== 'SENT') return;
    await this.prisma.operationsNotification.update({
      where: { id: notification.id },
      data: { channelReminderTelegramSentAt: new Date() },
    });
  }
  private async sendTelegram(
    input: {
      workspaceId: string;
      title: string;
      body: string;
      telegramHtml?: string;
    },
    privateChat: boolean,
  ) {
    if (!this.moduleRef) return;
    const bot = await this.moduleRef.resolve(
      TelegramSystemBotNotificationsService,
      undefined,
      { strict: false },
    );
    const text =
      input.telegramHtml ?? `${input.title}\n\n${input.body}`.slice(0, 4096);
    const format = input.telegramHtml ? 'HTML' : undefined;
    if (privateChat)
      return bot.sendToWorkspaceAccount(input.workspaceId, text, format);
    return input.telegramHtml
      ? bot.sendToWorkspace(input.workspaceId, text, format)
      : bot.sendToWorkspace(input.workspaceId, text);
  }
}
