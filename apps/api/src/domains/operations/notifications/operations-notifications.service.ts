import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import type {
  OperationsNotificationPage,
  OperationsNotificationPreferencesPatch,
  OperationsNotificationUnreadCount,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import {
  OperationsPushSubscriptionDto,
  OperationsNotificationsQueryDto,
} from './operations-notifications.dto';
import { mapOperationsNotification } from './operations-notification.mapper';
import { OperationsWebPushConfigService } from './operations-web-push-config.service';
import { OperationsNotificationPermissionService } from './operations-notification-permission.service';
import { OperationsNotificationPreferencesService } from './operations-notification-preferences.service';
import { operationsNotificationPreferenceWhere } from './operations-notification-preference-policy';
import {
  groupCrmNotificationRows,
  hydrateTelegramAccountNotifications,
  notificationConversationIds,
  notificationTelegramAccountIds,
} from './operations-notification-list-presentation';

type Cursor = { createdAt: Date; id: string };

@Injectable()
export class OperationsNotificationsService {
  private readonly preferencesService: OperationsNotificationPreferencesService;
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly pushConfig: OperationsWebPushConfigService,
    private readonly permissions: OperationsNotificationPermissionService,
    @Optional() preferencesService?: OperationsNotificationPreferencesService,
  ) {
    this.preferencesService =
      preferencesService ??
      new OperationsNotificationPreferencesService(
        prisma,
        authorization,
        pushConfig,
      );
  }

  async list(
    userId: string,
    query: OperationsNotificationsQueryDto,
  ): Promise<OperationsNotificationPage> {
    const access = await this.access(userId);
    const cursor = this.decodeCursor(query.cursor);
    const limit = this.limit(query.limit);
    const now = new Date();
    const rows = await this.prisma.operationsNotification.findMany({
      where: {
        workspaceId: access.workspaceId,
        recipientMemberId: access.memberId,
        publishedAt: { not: null, lte: now },
        expiresAt: { gt: now },
        ...this.visibility(access),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        recipient: {
          select: {
            operationsNotificationPreference: {
              select: { crmMessagePreviewEnabled: true },
            },
          },
        },
      },
    });
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    const conversationIds = notificationConversationIds(items);
    const conversations = conversationIds.length
      ? await this.prisma.telegramCrmConversation.findMany({
          where: {
            workspaceId: access.workspaceId,
            id: { in: conversationIds },
          },
          select: {
            id: true,
            contactId: true,
            unreadCount: true,
            contact: { select: { displayName: true } },
            peer: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                photoUrl: true,
              },
            },
          },
        })
      : [];
    const accountIds = notificationTelegramAccountIds(items);
    const accounts = accountIds.length
      ? await this.prisma.telegramUserAccountIntegration.findMany({
          where: { workspaceId: access.workspaceId, id: { in: accountIds } },
          select: { id: true, label: true, photoUrl: true },
        })
      : [];
    return {
      items: hydrateTelegramAccountNotifications(
        groupCrmNotificationRows(
          items.map(({ recipient, ...row }) =>
            row.type.startsWith('CRM_') &&
            !recipient?.operationsNotificationPreference
              ?.crmMessagePreviewEnabled
              ? { ...row, body: 'Open Nexeloq to review the update.' }
              : row,
          ),
          conversations,
        ),
        accounts,
      ).map(mapOperationsNotification),
      nextCursor:
        rows.length > limit && last
          ? this.encodeCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    };
  }

  async unreadCount(
    userId: string,
  ): Promise<OperationsNotificationUnreadCount> {
    const access = await this.access(userId);
    const now = new Date();
    return {
      unread: await this.prisma.operationsNotification.count({
        where: {
          workspaceId: access.workspaceId,
          recipientMemberId: access.memberId,
          readAt: null,
          publishedAt: { not: null, lte: now },
          expiresAt: { gt: now },
          ...this.visibility(access),
        },
      }),
    };
  }

  async markOne(userId: string, id: string) {
    const access = await this.access(userId);
    const result = await this.prisma.operationsNotification.updateMany({
      where: {
        id,
        workspaceId: access.workspaceId,
        recipientMemberId: access.memberId,
        publishedAt: { not: null },
        readAt: null,
        ...this.visibility(access),
      },
      data: { readAt: new Date() },
    });
    if (!result.count) {
      const visible = await this.prisma.operationsNotification.findFirst({
        where: {
          id,
          workspaceId: access.workspaceId,
          recipientMemberId: access.memberId,
          publishedAt: { not: null },
          ...this.visibility(access),
        },
        select: { id: true },
      });
      if (!visible) throw new NotFoundException('Notification not found');
    }
    return this.unreadCount(userId);
  }

  async markVisible(userId: string, ids: string[]) {
    const access = await this.access(userId);
    const uniqueIds = [...new Set(ids)].slice(0, 50);
    if (uniqueIds.length) {
      await this.prisma.operationsNotification.updateMany({
        where: {
          id: { in: uniqueIds },
          workspaceId: access.workspaceId,
          recipientMemberId: access.memberId,
          publishedAt: { not: null },
          readAt: null,
          ...this.visibility(access),
        },
        data: { readAt: new Date() },
      });
    }
    return this.unreadCount(userId);
  }

  async markAll(userId: string) {
    const access = await this.access(userId);
    await this.prisma.operationsNotification.updateMany({
      where: {
        workspaceId: access.workspaceId,
        recipientMemberId: access.memberId,
        publishedAt: { not: null },
        readAt: null,
        ...this.visibility(access),
      },
      data: { readAt: new Date() },
    });
    return this.unreadCount(userId);
  }

  preferences(userId: string) {
    return this.preferencesService.preferences(userId);
  }
  updatePreferences(
    userId: string,
    input: boolean | OperationsNotificationPreferencesPatch,
  ) {
    return this.preferencesService.updatePreferences(userId, input);
  }
  subscribe(userId: string, dto: OperationsPushSubscriptionDto) {
    return this.preferencesService.subscribe(userId, dto);
  }
  unsubscribe(userId: string, endpoint: string) {
    return this.preferencesService.unsubscribe(userId, endpoint);
  }
  pushPublicConfig(userId: string) {
    return this.preferencesService.pushPublicConfig(userId);
  }

  private visibility(access: {
    permissionKeys: Iterable<string>;
    memberId: string;
  }) {
    return {
      AND: [
        this.permissions.visibilityWhere(
          access.permissionKeys,
          access.memberId,
        ),
        operationsNotificationPreferenceWhere(),
      ],
    };
  }

  private access(userId: string) {
    return this.authorization.require(userId, 'operations.notifications');
  }

  private limit(value?: string) {
    const parsed = Number(value ?? 20);
    return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 50) : 20;
  }

  private encodeCursor(cursor: Cursor) {
    return Buffer.from(
      `${cursor.createdAt.toISOString()}|${cursor.id}`,
    ).toString('base64url');
  }

  private decodeCursor(value?: string): Cursor | null {
    if (!value) return null;
    try {
      const [rawDate, id, ...extra] = Buffer.from(value, 'base64url')
        .toString('utf8')
        .split('|');
      const createdAt = new Date(rawDate);
      if (!id || extra.length || Number.isNaN(createdAt.getTime())) return null;
      return { createdAt, id };
    } catch {
      return null;
    }
  }
}
