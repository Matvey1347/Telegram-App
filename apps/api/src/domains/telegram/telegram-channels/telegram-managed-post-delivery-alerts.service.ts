import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { OperationsNotificationStoreService } from '../../operations/notifications/operations-notification-store.service';
import { OperationsNotificationPublisherService } from '../../operations/notifications/operations-notification-publisher.service';
import {
  OperationsNotificationPermissionService,
  operationsNotificationMemberSelect,
} from '../../operations/notifications/operations-notification-permission.service';

/** One durable, actionable notification per post/outcome, never per retry. */
@Injectable()
export class TelegramManagedPostDeliveryAlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: OperationsNotificationStoreService,
    private readonly publisher: OperationsNotificationPublisherService,
    private readonly permissions: OperationsNotificationPermissionService,
  ) {}

  async notify(
    post: { id: string; workspaceId: string; telegramChannelId: string },
    state: 'UNKNOWN' | 'BLOCKED' | 'RETRY',
  ) {
    const sourceKey = `managed-post:${post.id}:delivery:${state}`;
    if (
      await this.prisma.operationsNotification.findFirst({
        where: {
          workspaceId: post.workspaceId,
          sourceKey,
          type: 'CRM_PLACEMENT_FAILURE',
        },
        select: { id: true },
      })
    )
      return;
    const managed = await this.prisma.telegramManagedPost.findFirst({
      where: { id: post.id, workspaceId: post.workspaceId },
      select: { assignedMemberId: true },
    });
    const members = await this.prisma.workspaceMember.findMany({
      where: {
        workspaceId: post.workspaceId,
        isHidden: false,
        OR: [{ role: 'owner' }, { id: managed?.assignedMemberId ?? '' }],
      },
      select: operationsNotificationMemberSelect,
    });
    const recipients = members.filter(
      (member) =>
        this.permissions.canReceive(member) &&
        this.permissions.has(member, 'channels.view'),
    );
    const created = await this.store.insertMany(
      this.prisma,
      recipients.map((member) => ({
        workspaceId: post.workspaceId,
        recipientMemberId: member.id,
        type: 'CRM_PLACEMENT_FAILURE',
        priority: 'HIGH',
        sourceKey,
        copyKey: 'telegram.publication.delivery_failure',
        title: 'Публикация требует проверки',
        body:
          state === 'UNKNOWN'
            ? 'Telegram не подтвердил результат отправки. Проверяем сообщение; повторная отправка без подтверждения заблокирована.'
            : state === 'BLOCKED'
              ? 'Telegram отклонил публикацию. Проверьте доступ к каналу и содержимое, затем повторите отправку.'
              : 'Обработка публикации не завершена. Система выполняет безопасное восстановление.',
        metadata: { managedPostId: post.id, state },
        requiredPermissionKey: 'channels.view',
        targetUrl: `/telegram-posts/${post.telegramChannelId}/editor?postId=${post.id}`,
        publishedAt: new Date(),
      })),
    );
    await this.publisher.publish(created.map((row) => row.id));
  }
}
