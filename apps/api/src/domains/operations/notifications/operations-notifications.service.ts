import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  OperationsNotificationPage,
  OperationsNotificationPreferences,
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
import { OPERATIONS_PUSH_MAX_ACTIVE_DEVICES } from './operations-notification-policy';

type Cursor = { createdAt: Date; id: string };

@Injectable()
export class OperationsNotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly pushConfig: OperationsWebPushConfigService,
    private readonly permissions: OperationsNotificationPermissionService,
  ) {}

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
        ...this.permissions.visibilityWhere(
          access.permissionKeys,
          access.memberId,
        ),
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
    });
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return {
      items: items.map(mapOperationsNotification),
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
          ...this.permissions.visibilityWhere(
            access.permissionKeys,
            access.memberId,
          ),
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
        ...this.permissions.visibilityWhere(
          access.permissionKeys,
          access.memberId,
        ),
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
          ...this.permissions.visibilityWhere(
            access.permissionKeys,
            access.memberId,
          ),
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
          ...this.permissions.visibilityWhere(
            access.permissionKeys,
            access.memberId,
          ),
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
        ...this.permissions.visibilityWhere(
          access.permissionKeys,
          access.memberId,
        ),
      },
      data: { readAt: new Date() },
    });
    return this.unreadCount(userId);
  }

  async preferences(
    userId: string,
  ): Promise<OperationsNotificationPreferences> {
    const access = await this.access(userId);
    const [preference, activeSubscriptionCount] = await Promise.all([
      this.prisma.operationsNotificationPreference.findUnique({
        where: {
          workspaceId_memberId: {
            workspaceId: access.workspaceId,
            memberId: access.memberId,
          },
        },
        select: { webPushEnabled: true },
      }),
      this.prisma.operationsPushSubscription.count({
        where: { userId, active: true },
      }),
    ]);
    return {
      webPushEnabled: preference?.webPushEnabled ?? false,
      pushConfigured: this.pushConfig.get().enabled,
      activeSubscriptionCount,
    };
  }

  async updatePreferences(userId: string, webPushEnabled: boolean) {
    const access = await this.access(userId);
    const key = {
      workspaceId: access.workspaceId,
      memberId: access.memberId,
    };
    const current =
      await this.prisma.operationsNotificationPreference.findUnique({
        where: { workspaceId_memberId: key },
        select: { webPushEnabled: true },
      });
    if (!current && webPushEnabled) {
      await this.prisma.operationsNotificationPreference.upsert({
        where: { workspaceId_memberId: key },
        create: { ...key, webPushEnabled: true },
        update: { webPushEnabled: true },
      });
    } else if (current && current.webPushEnabled !== webPushEnabled) {
      await this.prisma.operationsNotificationPreference.update({
        where: { workspaceId_memberId: key },
        data: { webPushEnabled },
      });
    }
    return this.preferences(userId);
  }

  async subscribe(userId: string, dto: OperationsPushSubscriptionDto) {
    await this.access(userId);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`operations-push-user:${userId}`}, 0))`,
      );
      const current = await tx.operationsPushSubscription.findUnique({
        where: { endpoint: dto.endpoint },
        select: {
          userId: true,
          p256dh: true,
          auth: true,
          userAgent: true,
          active: true,
        },
      });
      if (current && current.userId !== userId) {
        throw new ConflictException('Push endpoint belongs to another User');
      }
      if (!current || !current.active) {
        const activeCount = await tx.operationsPushSubscription.count({
          where: { userId, active: true },
        });
        if (activeCount >= OPERATIONS_PUSH_MAX_ACTIVE_DEVICES) {
          throw new ConflictException(
            `A User can have at most ${OPERATIONS_PUSH_MAX_ACTIVE_DEVICES} active push devices`,
          );
        }
      }
      const nextAgent = dto.userAgent ?? null;
      if (!current) {
        await tx.operationsPushSubscription.create({
          data: {
            userId,
            endpoint: dto.endpoint,
            p256dh: dto.keys.p256dh,
            auth: dto.keys.auth,
            userAgent: nextAgent,
          },
        });
      } else if (
        !current.active ||
        current.p256dh !== dto.keys.p256dh ||
        current.auth !== dto.keys.auth ||
        current.userAgent !== nextAgent
      ) {
        await tx.operationsPushSubscription.update({
          where: { endpoint: dto.endpoint },
          data: {
            p256dh: dto.keys.p256dh,
            auth: dto.keys.auth,
            userAgent: nextAgent,
            active: true,
            disabledAt: null,
          },
        });
      }
    });
    return this.preferences(userId);
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.access(userId);
    await this.prisma.operationsPushSubscription.updateMany({
      where: { userId, endpoint, active: true },
      data: { active: false, disabledAt: new Date() },
    });
    return this.preferences(userId);
  }

  pushPublicConfig(userId: string) {
    return this.access(userId).then(() => this.pushConfig.publicConfig());
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
