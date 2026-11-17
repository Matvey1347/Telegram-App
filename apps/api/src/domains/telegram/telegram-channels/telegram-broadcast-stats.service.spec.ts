import { TelegramBroadcastStatsService } from './telegram-broadcast-stats.service';

describe('TelegramBroadcastStatsService', () => {
  it('writes large graph histories in bounded transactions', async () => {
    const transactionBatches: Array<{ size: number; options: unknown }> = [];
    const prisma = {
      telegramChannel: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'channel-1',
          currentSubscribersCount: 10_000,
        }),
      },
      telegramChannelStatsSnapshot: {
        upsert: jest.fn().mockResolvedValue({ id: 'snapshot-1' }),
      },
      telegramChannelStatsPoint: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest
        .fn()
        .mockImplementation((queries: unknown[], options: unknown) => {
          transactionBatches.push({ size: queries.length, options });
          return Promise.resolve(queries);
        }),
    };
    const mtproto = {
      getBroadcastStats: jest.fn().mockResolvedValue({
        raw: {},
        normalized: {
          status: 'available',
          graphs: {
            views: {
              status: 'available',
              data: {
                columns: [
                  ['x', ...Array.from({ length: 501 }, (_, index) => index)],
                  [
                    'views',
                    ...Array.from({ length: 501 }, (_, index) => index),
                  ],
                ],
              },
            },
          },
        },
        availableFields: ['views'],
        warnings: [],
      }),
    };
    const sourceAccess = { recordDataSource: jest.fn() };
    const support = {
      toUtcDay: jest.fn((date: Date) => date),
      createAudienceSnapshotSafely: jest.fn().mockResolvedValue(null),
    };
    const channelAccess = {
      connectedAccount: jest.fn().mockResolvedValue({ id: 'account-1' }),
      mtprotoChannelReference: jest
        .fn()
        .mockReturnValue({ telegramChatId: '1' }),
      accountCredentials: jest.fn().mockReturnValue({}),
      sourceDisplayName: jest.fn().mockReturnValue('account'),
    };
    const service = new TelegramBroadcastStatsService(
      prisma as never,
      mtproto as never,
      sourceAccess as never,
      { info: jest.fn() } as never,
      support as never,
      channelAccess as never,
      {} as never,
    );

    const result = await service.syncBroadcastStatsForWorkspace(
      'workspace-1',
      'channel-1',
      'account-1',
    );

    expect(result.pointsUpserted).toBe(501);
    expect(transactionBatches).toEqual([
      { size: 250, options: { timeout: 30_000 } },
      { size: 250, options: { timeout: 30_000 } },
      { size: 1, options: { timeout: 30_000 } },
    ]);
  });
});
