import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  GreeterAnalytics,
  GreeterAnalyticsQuery,
  GreeterCaptchaStatus,
  GreeterUsersQuery,
  GreeterUsersResponse,
  GreeterUserState,
} from '@telegram-system/shared';
import { GreeterAutomationEnvironment, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { GreeterAdminService } from './greeter-admin.service';

@Injectable()
export class GreeterAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: GreeterAdminService,
  ) {}

  private userState(
    user: { blockedAt: Date | null; startedAt: Date | null },
    join?: { captchaPassedAt: Date | null; status: string },
  ): GreeterUserState {
    return user.blockedAt
      ? 'BLOCKED'
      : user.startedAt || join?.captchaPassedAt || join?.status === 'APPROVED'
        ? 'ALIVE'
        : 'DID_NOT_INTERACT';
  }

  private captchaStatus(join: {
    status: string;
    captchaPassedAt: Date | null;
    captchaFailedAt: Date | null;
  }): GreeterCaptchaStatus {
    if (join.status === 'APPROVED') return 'APPROVED';
    if (join.status === 'DECLINED') return 'DECLINED';
    if (join.status === 'EXPIRED') return 'EXPIRED';
    if (join.captchaFailedAt) return 'FAILED';
    if (join.captchaPassedAt) return 'PASSED';
    return 'PENDING';
  }

  private stateWhere(
    state: GreeterUserState | undefined,
    botIntegrationId: string,
  ): Prisma.TelegramBotUserWhereInput {
    if (state === 'BLOCKED') return { blockedAt: { not: null } };
    const interactedJoin: Prisma.GreeterJoinRequestWhereInput = {
      botIntegrationId,
      environment: GreeterAutomationEnvironment.PRODUCTION,
      OR: [{ captchaPassedAt: { not: null } }, { status: 'APPROVED' }],
    };
    if (state === 'ALIVE')
      return {
        blockedAt: null,
        OR: [
          { startedAt: { not: null } },
          { greeterJoinRequests: { some: interactedJoin } },
        ],
      };
    if (state === 'DID_NOT_INTERACT')
      return {
        blockedAt: null,
        startedAt: null,
        greeterJoinRequests: { none: interactedJoin },
      };
    return {};
  }

  async users(
    userId: string,
    botId: string,
    query: GreeterUsersQuery,
  ): Promise<GreeterUsersResponse> {
    const bot = await this.admin.requireBot(userId, botId);
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 25));
    const status = query.captchaStatus;
    const where: Prisma.GreeterJoinRequestWhereInput = {
      workspaceId: bot.workspaceId,
      botIntegrationId: bot.id,
      environment: GreeterAutomationEnvironment.PRODUCTION,
      ...(query.channelId ? { channelId: query.channelId } : {}),
      ...(status === 'APPROVED' || status === 'DECLINED' || status === 'EXPIRED'
        ? { status }
        : {}),
      ...(status === 'FAILED'
        ? { status: 'PENDING_CAPTCHA', captchaFailedAt: { not: null } }
        : {}),
      ...(status === 'PASSED'
        ? { status: 'PENDING_CAPTCHA', captchaPassedAt: { not: null } }
        : {}),
      ...(status === 'PENDING'
        ? {
            status: 'PENDING_CAPTCHA',
            captchaPassedAt: null,
            captchaFailedAt: null,
          }
        : {}),
      telegramUser: {
        ...this.stateWhere(query.state, bot.id),
        ...(query.search?.trim()
          ? {
              OR: [
                {
                  username: {
                    contains: query.search.trim(),
                    mode: 'insensitive',
                  },
                },
                {
                  firstName: {
                    contains: query.search.trim(),
                    mode: 'insensitive',
                  },
                },
                {
                  lastName: {
                    contains: query.search.trim(),
                    mode: 'insensitive',
                  },
                },
                { telegramUserId: { contains: query.search.trim() } },
              ],
            }
          : {}),
      },
    };
    const groups = await this.prisma.greeterJoinRequest.groupBy({
      by: ['telegramBotUserId'],
      where,
      _max: { requestedAt: true },
      orderBy: [
        { _max: { requestedAt: 'desc' } },
        { telegramBotUserId: 'asc' },
      ],
    });
    const totalItems = groups.length;
    const pageUserIds = groups
      .slice((page - 1) * pageSize, page * pageSize)
      .map((item) => item.telegramBotUserId);
    const foundRows = pageUserIds.length
      ? await this.prisma.greeterJoinRequest.findMany({
          where: { AND: [where, { telegramBotUserId: { in: pageUserIds } }] },
          include: {
            telegramUser: true,
            channel: { select: { id: true, title: true, username: true } },
          },
          distinct: ['telegramBotUserId'],
          orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
        })
      : [];
    const byUser = new Map(
      foundRows.map((row) => [row.telegramBotUserId, row]),
    );
    const rows = pageUserIds.flatMap((id) => {
      const row = byUser.get(id);
      return row ? [row] : [];
    });
    const totalPages = Math.ceil(totalItems / pageSize);
    return {
      items: rows.map((row) => ({
        id: row.telegramUser.id,
        telegramUserId: row.telegramUser.telegramUserId,
        displayName:
          [row.telegramUser.firstName, row.telegramUser.lastName]
            .filter(Boolean)
            .join(' ') ||
          row.telegramUser.username ||
          row.telegramUser.telegramUserId,
        username: row.telegramUser.username,
        channel: row.channel,
        firstSeenAt: row.telegramUser.firstSeenAt.toISOString(),
        joinRequestedAt: row.requestedAt.toISOString(),
        captchaStatus: this.captchaStatus(row),
        approvedAt: row.approvedAt?.toISOString() ?? null,
        state: this.userState(row.telegramUser, row),
        blockedAt: row.telegramUser.blockedAt?.toISOString() ?? null,
        lastInteractionAt: row.telegramUser.lastInteractionAt.toISOString(),
      })),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async analytics(
    userId: string,
    botId: string,
    query: GreeterAnalyticsQuery,
  ): Promise<GreeterAnalytics> {
    const bot = await this.admin.requireBot(userId, botId);
    const from = query.from ? new Date(query.from) : null;
    const to = query.to
      ? /^\d{4}-\d{2}-\d{2}$/.test(query.to)
        ? new Date(`${query.to}T23:59:59.999Z`)
        : new Date(query.to)
      : null;
    if (
      (from && Number.isNaN(from.getTime())) ||
      (to && Number.isNaN(to.getTime())) ||
      (from && to && from > to)
    )
      throw new BadRequestException('Invalid analytics range');
    const requestedAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
    const joinWhere: Prisma.GreeterJoinRequestWhereInput = {
      workspaceId: bot.workspaceId,
      botIntegrationId: bot.id,
      environment: GreeterAutomationEnvironment.PRODUCTION,
      ...(query.channelId ? { channelId: query.channelId } : {}),
      ...(from || to ? { requestedAt } : {}),
    };
    const [rows, acquisitions] = await Promise.all([
      this.prisma.greeterJoinRequest.findMany({
        where: joinWhere,
        select: {
          requestedAt: true,
          captchaStartedAt: true,
          captchaPassedAt: true,
          captchaFailedAt: true,
          status: true,
          telegramBotUserId: true,
        },
      }),
      this.prisma.greeterJoinRequest.groupBy({
        by: ['telegramBotUserId'],
        where: {
          workspaceId: bot.workspaceId,
          botIntegrationId: bot.id,
          environment: GreeterAutomationEnvironment.PRODUCTION,
          ...(query.channelId ? { channelId: query.channelId } : {}),
        },
        _min: { requestedAt: true },
      }),
    ]);
    const userIds = [...new Set(rows.map((row) => row.telegramBotUserId))];
    const users = await this.prisma.telegramBotUser.findMany({
      where: {
        workspaceId: bot.workspaceId,
        botIntegrationId: bot.id,
        id: { in: userIds },
      },
      select: { id: true, firstSeenAt: true, startedAt: true, blockedAt: true },
    });
    const passedUserIds = new Set(
      rows
        .filter((item) => item.captchaPassedAt || item.status === 'APPROVED')
        .map((item) => item.telegramBotUserId),
    );
    const alive = users.filter(
      (item) =>
        !item.blockedAt && (item.startedAt || passedUserIds.has(item.id)),
    ).length;
    const blocked = users.filter((item) => item.blockedAt).length;
    const didNotInteract = users.length - alive - blocked;
    const passed = rows.filter((item) => item.captchaPassedAt).length;
    const started = rows.filter((item) => item.captchaStartedAt).length;
    const trends = new Map<
      string,
      {
        date: string;
        acquired: number;
        captchaStarted: number;
        captchaPassed: number;
      }
    >();
    for (const row of rows) {
      const date = row.requestedAt.toISOString().slice(0, 10);
      const item = trends.get(date) || {
        date,
        acquired: 0,
        captchaStarted: 0,
        captchaPassed: 0,
      };
      if (row.captchaStartedAt) item.captchaStarted += 1;
      if (row.captchaPassedAt) item.captchaPassed += 1;
      trends.set(date, item);
    }
    for (const acquisition of acquisitions) {
      const acquiredAt = acquisition._min.requestedAt;
      if (!acquiredAt || (from && acquiredAt < from) || (to && acquiredAt > to))
        continue;
      const date = acquiredAt.toISOString().slice(0, 10);
      const item = trends.get(date) || {
        date,
        acquired: 0,
        captchaStarted: 0,
        captchaPassed: 0,
      };
      item.acquired += 1;
      trends.set(date, item);
    }
    return {
      range: {
        from: from?.toISOString() ?? null,
        to: to?.toISOString() ?? null,
        channelId: query.channelId ?? null,
      },
      metrics: {
        growth: acquisitions.filter(
          (item) =>
            item._min.requestedAt &&
            (!from || item._min.requestedAt >= from) &&
            (!to || item._min.requestedAt <= to),
        ).length,
        alive,
        blocked,
        didNotInteract,
        joinRequests: rows.length,
        captchaStarted: started,
        captchaPassed: passed,
        captchaFailed: rows.filter((item) => item.captchaFailedAt).length,
        captchaPassRate: started ? passed / started : 0,
        approved: rows.filter((item) => item.status === 'APPROVED').length,
        interactionRate: users.length ? alive / users.length : 0,
      },
      trends: [...trends.values()].sort((a, b) => a.date.localeCompare(b.date)),
    };
  }
}
