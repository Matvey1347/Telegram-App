import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  OperationsNotificationPermissionService,
  operationsNotificationMemberSelect,
} from './operations-notification-permission.service';
import { OperationsNotificationPublisherService } from './operations-notification-publisher.service';
import { OperationsNotificationDueResolutionService } from './operations-notification-due-resolution.service';

@Injectable()
export class OperationsNotificationDueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: OperationsNotificationPermissionService,
    private readonly publisher: OperationsNotificationPublisherService,
    private readonly resolution: OperationsNotificationDueResolutionService,
  ) {}

  async processDueBatch(limit = 1_000) {
    const bounded = Math.max(1, Math.min(1_000, limit));
    const ids = await this.prisma.$transaction(async (tx) => {
      const published = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        WITH due AS (
          SELECT "id"
          FROM "OperationsNotification"
          WHERE "publishedAt" IS NULL
            AND "deliverAt" <= NOW()
            AND "expiresAt" > NOW()
          ORDER BY "deliverAt", "id"
          FOR UPDATE SKIP LOCKED
          LIMIT ${bounded}
        )
        UPDATE "OperationsNotification" notification
        SET "publishedAt" = NOW()
        FROM due
        WHERE notification."id" = due."id"
        RETURNING notification."id"
      `);
      if (!published.length) return [];
      let candidates = await tx.operationsNotification.findMany({
        where: { id: { in: published.map((item) => item.id) } },
        select: {
          id: true,
          workspaceId: true,
          type: true,
          recipientMemberId: true,
          requiredPermissionKey: true,
          ownPermissionKey: true,
          anyPermissionKey: true,
          visibilityMemberId: true,
          visibilityResourceKey: true,
          recipient: { select: operationsNotificationMemberSelect },
        },
      });
      const rerouted = await this.resolution.resolve(tx, candidates);
      if (rerouted) {
        candidates = await tx.operationsNotification.findMany({
          where: { id: { in: published.map((item) => item.id) } },
          select: {
            id: true,
            workspaceId: true,
            type: true,
            recipientMemberId: true,
            requiredPermissionKey: true,
            ownPermissionKey: true,
            anyPermissionKey: true,
            visibilityMemberId: true,
            visibilityResourceKey: true,
            recipient: { select: operationsNotificationMemberSelect },
          },
        });
      }
      const allowed = candidates.filter((item) =>
        this.permissions.canAccess(item.recipient, item),
      );
      const allowedIds = new Set(allowed.map((item) => item.id));
      const deniedIds = published
        .map((item) => item.id)
        .filter((id) => !allowedIds.has(id));
      if (deniedIds.length) {
        await tx.operationsNotification.deleteMany({
          where: { id: { in: deniedIds } },
        });
      }
      return [...allowedIds];
    });
    await this.publisher.publish(ids, { wakeRetention: false });
    const expired = await this.prisma.$executeRaw(Prisma.sql`
      WITH expired AS (
        SELECT "id"
        FROM "OperationsNotification"
        WHERE "expiresAt" <= NOW()
        ORDER BY "expiresAt", "id"
        FOR UPDATE SKIP LOCKED
        LIMIT ${bounded}
      )
      DELETE FROM "OperationsNotification" notification
      USING expired
      WHERE notification."id" = expired."id"
    `);
    return { published: ids.length, expired };
  }
}
