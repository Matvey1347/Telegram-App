import { GreeterAnalyticsService } from './greeter-analytics.service';

describe('GreeterAnalyticsService', () => {
  it('scopes channel/state user predicates to the admin workspace and bot', async () => {
    const prisma = {
      greeterJoinRequest: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as any;
    const service = new GreeterAnalyticsService(prisma, {
      requireBot: jest
        .fn()
        .mockResolvedValue({ id: 'bot', workspaceId: 'workspace' }),
    } as any);
    await service.users('admin', 'bot', {
      channelId: 'channel',
      state: 'ALIVE',
    });
    const where = prisma.greeterJoinRequest.groupBy.mock.calls[0][0].where;
    expect(where).toMatchObject({
      workspaceId: 'workspace',
      botIntegrationId: 'bot',
      channelId: 'channel',
      telegramUser: { blockedAt: null },
    });
    expect(where.telegramUser.OR).toEqual([
      { startedAt: { not: null } },
      {
        greeterJoinRequests: {
          some: {
            botIntegrationId: 'bot',
            environment: 'PRODUCTION',
            OR: [{ captchaPassedAt: { not: null } }, { status: 'APPROVED' }],
          },
        },
      },
    ]);
  });

  it('returns stable pagination and derives user/captcha state', async () => {
    const now = new Date('2026-08-09T10:00:00Z');
    const prisma = {
      greeterJoinRequest: {
        groupBy: jest
          .fn()
          .mockResolvedValue([
            { telegramBotUserId: 'u', _max: { requestedAt: now } },
          ]),
        findMany: jest.fn().mockResolvedValue([
          {
            telegramBotUserId: 'u',
            status: 'APPROVED',
            captchaPassedAt: now,
            captchaFailedAt: null,
            requestedAt: now,
            approvedAt: now,
            channel: { id: 'c', title: 'News', username: 'news' },
            telegramUser: {
              id: 'u',
              telegramUserId: '7',
              firstName: 'Ada',
              lastName: null,
              username: 'ada',
              firstSeenAt: now,
              lastInteractionAt: now,
              startedAt: now,
              blockedAt: null,
            },
          },
        ]),
      },
    } as any;
    const service = new GreeterAnalyticsService(prisma, {
      requireBot: jest.fn().mockResolvedValue({ id: 'b', workspaceId: 'w' }),
    } as any);
    const result = await service.users('admin', 'b', { page: 1, pageSize: 10 });
    expect(result.items[0]).toMatchObject({
      displayName: 'Ada',
      captchaStatus: 'APPROVED',
      state: 'ALIVE',
    });
    expect(result.pagination).toMatchObject({
      totalItems: 1,
      totalPages: 1,
      hasNextPage: false,
    });
  });

  it('aggregates funnel metrics with zero-safe rates', async () => {
    const prisma = {
      greeterJoinRequest: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      telegramBotUser: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;
    const service = new GreeterAnalyticsService(prisma, {
      requireBot: jest.fn().mockResolvedValue({ id: 'b', workspaceId: 'w' }),
    } as any);
    await expect(service.analytics('admin', 'b', {})).resolves.toMatchObject({
      metrics: { joinRequests: 0, captchaPassRate: 0, interactionRate: 0 },
      trends: [],
    });
  });

  it('applies a today/channel range and keeps ALIVE, BLOCKED and DID_NOT_INTERACT exclusive', async () => {
    const from = '2026-08-09T00:00:00.000Z';
    const to = '2026-08-09T23:59:59.999Z';
    const requestedAt = new Date('2026-08-09T12:00:00.000Z');
    const rows = [
      {
        requestedAt,
        captchaStartedAt: requestedAt,
        captchaPassedAt: requestedAt,
        captchaFailedAt: null,
        status: 'APPROVED',
        telegramBotUserId: 'alive',
      },
      {
        requestedAt,
        captchaStartedAt: requestedAt,
        captchaPassedAt: null,
        captchaFailedAt: requestedAt,
        status: 'PENDING_CAPTCHA',
        telegramBotUserId: 'blocked',
      },
      {
        requestedAt,
        captchaStartedAt: null,
        captchaPassedAt: null,
        captchaFailedAt: null,
        status: 'PENDING_CAPTCHA',
        telegramBotUserId: 'idle',
      },
    ];
    const prisma = {
      greeterJoinRequest: {
        findMany: jest.fn().mockResolvedValue(rows),
        groupBy: jest.fn().mockResolvedValue(
          rows.map((item) => ({
            telegramBotUserId: item.telegramBotUserId,
            _min: { requestedAt },
          })),
        ),
      },
      telegramBotUser: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'alive',
            firstSeenAt: requestedAt,
            startedAt: null,
            blockedAt: null,
          },
          {
            id: 'blocked',
            firstSeenAt: requestedAt,
            startedAt: requestedAt,
            blockedAt: requestedAt,
          },
          {
            id: 'idle',
            firstSeenAt: requestedAt,
            startedAt: null,
            blockedAt: null,
          },
        ]),
      },
    } as any;
    const service = new GreeterAnalyticsService(prisma, {
      requireBot: jest
        .fn()
        .mockResolvedValue({ id: 'bot', workspaceId: 'workspace' }),
    } as any);
    const result = await service.analytics('admin', 'bot', {
      from,
      to,
      channelId: 'channel',
    });
    expect(prisma.greeterJoinRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace',
          botIntegrationId: 'bot',
          environment: 'PRODUCTION',
          channelId: 'channel',
          requestedAt: { gte: new Date(from), lte: new Date(to) },
        },
      }),
    );
    expect(prisma.greeterJoinRequest.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace',
          botIntegrationId: 'bot',
          environment: 'PRODUCTION',
          channelId: 'channel',
        },
      }),
    );
    expect(result.metrics).toMatchObject({
      growth: 3,
      alive: 1,
      blocked: 1,
      didNotInteract: 1,
      joinRequests: 3,
      captchaPassed: 1,
      captchaFailed: 1,
    });
    expect(
      result.metrics.alive +
        result.metrics.blocked +
        result.metrics.didNotInteract,
    ).toBe(3);
  });
});
