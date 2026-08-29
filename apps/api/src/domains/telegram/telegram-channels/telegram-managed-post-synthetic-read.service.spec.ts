import { TelegramManagedPostSyntheticReadService } from './telegram-managed-post-synthetic-read.service';

describe('TelegramManagedPostSyntheticReadService', () => {
  it('returns an exact count and skips source work for an empty page slice', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ count: 3n }]),
      telegramPost: { findFirst: jest.fn() },
    };
    const service = new TelegramManagedPostSyntheticReadService(
      prisma as never,
    );

    await expect(
      service.count('workspace-1', 'channel-1', 'launch'),
    ).resolves.toBe(3);
    await expect(
      service.findPage('workspace-1', 'channel-1', undefined, 0, 0),
    ).resolves.toEqual([]);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('scopes direct synchronized-post reads to workspace and channel', async () => {
    const prisma = {
      $queryRaw: jest.fn(),
      telegramPost: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new TelegramManagedPostSyntheticReadService(
      prisma as never,
    );

    await service.findOne('workspace-1', 'channel-1', 'post-1');

    expect(prisma.telegramPost.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'post-1',
          workspaceId: 'workspace-1',
          telegramChannelId: 'channel-1',
        },
      }),
    );
  });
});
