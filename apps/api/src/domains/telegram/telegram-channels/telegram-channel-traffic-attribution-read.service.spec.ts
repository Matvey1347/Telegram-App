import { TelegramChannelTrafficAttributionReadService } from './telegram-channel-traffic-attribution-read.service';

describe('TelegramChannelTrafficAttributionReadService', () => {
  it('types the direct-mutual tracking boundary as a database timestamp', async () => {
    const prisma = {
      telegramChannel: { findMany: jest.fn().mockResolvedValue([]) },
      telegramInviteLink: { findMany: jest.fn().mockResolvedValue([]) },
      adCampaign: { findMany: jest.fn().mockResolvedValue([]) },
      mutualPromotionFolderParticipant: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      crossPromotionPlan: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'plan-1',
            title: 'September mutual promotion',
            targets: [
              {
                telegramChannelId: 'channel-1',
                inviteLinkId: 'invite-1',
              },
            ],
            baselineTargetCounters: [],
            scheduledAt: new Date('2026-09-01T00:00:00.000Z'),
            trackingEndsAt: new Date('2026-09-02T00:00:00.000Z'),
          },
        ]),
      },
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ primaryCurrency: 'USD' }),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const service = new TelegramChannelTrafficAttributionReadService(
      prisma as never,
    );

    await service.batch('workspace-1', ['channel-1']);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const rawQuery = prisma.$queryRaw as unknown as {
      mock: { calls: Array<[{ strings: string[] }]> };
    };
    const query = rawQuery.mock.calls[0][0];
    expect(query.strings.join(' ')).toContain('AS TIMESTAMP(3)');
  });
});
