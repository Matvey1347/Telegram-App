import { TelegramManagedPostReconciliationService } from './telegram-managed-post-reconciliation.service';

describe('TelegramManagedPostReconciliationService local delivery', () => {
  it('continues after one due post fails and reports the observable result', async () => {
    const duePosts = [
      { id: 'broken', workspaceId: 'workspace', telegramChannelId: 'channel' },
      { id: 'healthy', workspaceId: 'workspace', telegramChannelId: 'channel' },
    ];
    const prisma = {
      telegramManagedPost: {
        findMany: jest.fn().mockResolvedValue(duePosts),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const publication = {
      publishManagedPost: jest
        .fn()
        .mockRejectedValueOnce(new Error('bot unavailable'))
        .mockResolvedValueOnce({ status: 'PUBLISHED' }),
    };
    const service = new TelegramManagedPostReconciliationService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      publication as never,
    );

    await expect(
      service.publishDueLocallyScheduledManagedPosts(),
    ).resolves.toEqual({ considered: 2, published: 1, failed: 1 });
    expect(publication.publishManagedPost).toHaveBeenCalledTimes(2);
  });
});
