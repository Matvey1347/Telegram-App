/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { TelegramManagedPostCalendarService } from './telegram-managed-post-calendar.service';

describe('TelegramManagedPostCalendarService', () => {
  it('checks the response cache before source reads and performs no writes', async () => {
    const cache = new Map<string, unknown>();
    const responseCache = {
      getOrSet: jest.fn(
        async (key: string, _ttl: number, factory: () => Promise<unknown>) => {
          if (cache.has(key)) return cache.get(key);
          const value = await factory();
          cache.set(key, value);
          return value;
        },
      ),
    };
    const prisma = {
      telegramManagedPost: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const support = {
      workspace: jest.fn().mockResolvedValue('workspace-1'),
      managedPostsCalendarCacheKey: jest
        .fn()
        .mockReturnValue('calendar:workspace-1:channel-1'),
      invalidateTelegramChannelReadCache: jest.fn(),
    };
    const catalog = {
      findOne: jest.fn().mockResolvedValue({ id: 'channel-1' }),
    };
    const service = new TelegramManagedPostCalendarService(
      prisma as any,
      responseCache as any,
      support as any,
      catalog as any,
    );
    const query = {
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-31T23:59:59.999Z',
    };

    const first = await service.managedPostsCalendar(
      'user-1',
      'channel-1',
      query,
    );
    const second = await service.managedPostsCalendar(
      'user-1',
      'channel-1',
      query,
    );

    expect(second).toEqual(first);
    expect(prisma.telegramManagedPost.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.telegramManagedPost.count).toHaveBeenCalledTimes(1);
    expect(prisma.telegramManagedPost.findFirst).toHaveBeenCalledTimes(1);
    expect(support.invalidateTelegramChannelReadCache).not.toHaveBeenCalled();
    expect(support.workspace).toHaveBeenCalledTimes(2);
    expect(catalog.findOne).toHaveBeenCalledTimes(2);
  });

  it('rejects ranges over 366 days before reading calendar rows', async () => {
    const prisma = {
      telegramManagedPost: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
      },
    };
    const service = new TelegramManagedPostCalendarService(
      prisma as any,
      { getOrSet: jest.fn() } as any,
      { workspace: jest.fn().mockResolvedValue('workspace-1') } as any,
      { findOne: jest.fn().mockResolvedValue({ id: 'channel-1' }) } as any,
    );

    await expect(
      service.managedPostsCalendar('user-1', 'channel-1', {
        from: '2025-01-01T00:00:00.000Z',
        to: '2026-08-01T00:00:00.000Z',
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'TELEGRAM_POST_CALENDAR_RANGE_TOO_LARGE',
        message: 'Calendar range is too large',
        params: { maxDays: 366 },
      },
    });
    expect(prisma.telegramManagedPost.findMany).not.toHaveBeenCalled();
  });

  it('returns a stable code for malformed calendar ranges', async () => {
    const service = new TelegramManagedPostCalendarService(
      {} as any,
      { getOrSet: jest.fn() } as any,
      { workspace: jest.fn().mockResolvedValue('workspace-1') } as any,
      { findOne: jest.fn().mockResolvedValue({ id: 'channel-1' }) } as any,
    );

    await expect(
      service.managedPostsCalendar('user-1', 'channel-1', {
        from: 'not-a-date',
        to: '2026-08-01T00:00:00.000Z',
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'TELEGRAM_POST_CALENDAR_RANGE_INVALID',
        message: 'Calendar range is invalid',
      },
    });
  });
});
