import {
  TelegramManagedPostOrigin,
  TelegramManagedPostStatus,
} from '@prisma/client';
import { TelegramChannelBookingReadService } from './telegram-channel-booking-read.service';

const scheduledPost = (
  telegramChannelId: string,
  scheduledAt: string,
  overrides: Record<string, unknown> = {},
) => ({
  telegramChannelId,
  scheduledAt: new Date(scheduledAt),
  origin: TelegramManagedPostOrigin.SYSTEM,
  remoteImportKey: null,
  title: 'Real post',
  text: 'Substantive post content',
  imageUrls: [],
  buttonRows: null,
  ...overrides,
});

describe('TelegramChannelBookingReadService', () => {
  it('returns the first free calendar day instead of the furthest booking', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([
        scheduledPost('channel-1', '2026-08-24T12:00:00.000Z'),
        scheduledPost('channel-1', '2026-08-25T12:00:00.000Z'),
        scheduledPost('channel-1', '2026-09-30T12:00:00.000Z'),
      ]);
    const service = new TelegramChannelBookingReadService({
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ timezone: 'UTC' }),
      },
      telegramManagedPost: { findMany },
    } as never);
    const now = new Date('2026-08-23T10:00:00.000Z');

    const result = await service.summariesForChannels(
      'workspace-1',
      ['channel-1'],
      now,
    );
    const horizon = new Date(now.getTime() + 370 * 24 * 60 * 60 * 1000);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-1',
        telegramChannelId: { in: ['channel-1'] },
        status: TelegramManagedPostStatus.SCHEDULED,
        scheduledAt: { gt: now, lte: horizon },
      },
      select: {
        telegramChannelId: true,
        scheduledAt: true,
        origin: true,
        remoteImportKey: true,
        title: true,
        text: true,
        imageUrls: true,
        buttonRows: true,
      },
      orderBy: { scheduledAt: 'asc' },
    });
    expect(result.get('channel-1')).toEqual({
      futureScheduledTotal: 3,
      lastScheduledAt: '2026-09-30T12:00:00.000Z',
      nextAvailableDate: '2026-08-26',
      bookedThroughDate: '2026-08-25',
    });
  });

  it('ignores an imported standalone subscription ending', async () => {
    const service = new TelegramChannelBookingReadService({
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ timezone: 'Europe/Warsaw' }),
      },
      telegramManagedPost: {
        findMany: jest.fn().mockResolvedValue([
          scheduledPost('channel-money', '2026-09-30T17:25:00.000Z', {
            origin: TelegramManagedPostOrigin.TELEGRAM,
            remoteImportKey: 'message:4750',
            title: 'Підпишись 👉[Де гроші](https://t.me/example)',
            text: 'Підпишись 👉[Де гроші](https://t.me/example)',
          }),
        ]),
      },
    } as never);

    const result = await service.summariesForChannels(
      'workspace-1',
      ['channel-money'],
      new Date('2026-08-23T10:00:00.000Z'),
    );

    expect(result.get('channel-money')).toEqual({
      futureScheduledTotal: 0,
      lastScheduledAt: null,
      nextAvailableDate: '2026-08-24',
      bookedThroughDate: null,
    });
  });

  it('does not query the database for an empty channel list', async () => {
    const findMany = jest.fn();
    const findUnique = jest.fn();
    const service = new TelegramChannelBookingReadService({
      workspace: { findUnique },
      telegramManagedPost: { findMany },
    } as never);

    await expect(
      service.summariesForChannels('workspace-1', []),
    ).resolves.toEqual(new Map());
    expect(findMany).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
  });
});
