/* eslint-disable @typescript-eslint/no-unsafe-assignment -- focused Prisma read double */
import { MutualPromotionReadService } from './mutual-promotion-read.service';

describe('MutualPromotionReadService', () => {
  it('includes compact channel summaries in the folder list', async () => {
    const prisma = {
      mutualPromotionFolder: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'folder-1',
            title: 'September',
            titleTemplate: null,
            status: 'ACTIVE',
            startsAt: new Date('2026-09-08T08:00:00.000Z'),
            endsAt: new Date('2026-09-10T08:00:00.000Z'),
            notes: null,
            createdAt: new Date('2026-09-01T08:00:00.000Z'),
            updatedAt: new Date('2026-09-08T08:00:00.000Z'),
            _count: { participants: 1, posts: 5 },
            participants: [
              {
                role: 'PUBLISHER',
                telegramChannel: {
                  id: 'channel-1',
                  title: 'Channel One',
                  username: 'channel_one',
                  photoUrl: 'https://example.com/channel.jpg',
                },
              },
            ],
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const service = new MutualPromotionReadService(
      prisma as never,
      {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
      } as never,
      {} as never,
    );

    const result = await service.list('user-1', { page: 1, pageSize: 10 });

    expect(result.items[0].channels).toEqual([
      {
        id: 'channel-1',
        title: 'Channel One',
        username: 'channel_one',
        photoUrl: 'https://example.com/channel.jpg',
        role: 'PUBLISHER',
      },
    ]);
    expect(prisma.mutualPromotionFolder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          participants: expect.objectContaining({
            select: expect.objectContaining({
              telegramChannel: expect.any(Object),
            }),
          }),
        }),
      }),
    );
  });
});
