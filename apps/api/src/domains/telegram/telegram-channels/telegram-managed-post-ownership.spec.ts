/* eslint-disable @typescript-eslint/no-unsafe-assignment -- focused Prisma test double */
import { requireNonBatchManagedPosts } from './telegram-managed-post-ownership';

describe('requireNonBatchManagedPosts', () => {
  it('rejects a batch-owned managed post using workspace and channel scope', async () => {
    const prisma = {
      telegramPostBatchDelivery: { count: jest.fn().mockResolvedValue(1) },
    };

    await expect(
      requireNonBatchManagedPosts(prisma as never, {
        workspaceId: 'workspace-1',
        channelId: 'channel-1',
        postIds: ['post-1'],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'TELEGRAM_POST_NOT_EDITABLE',
      }),
    });
    expect(prisma.telegramPostBatchDelivery.count).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-1',
        telegramChannelId: 'channel-1',
        managedPostId: { in: ['post-1'] },
      },
    });
  });

  it('allows an ordinary managed post', async () => {
    const prisma = {
      telegramPostBatchDelivery: { count: jest.fn().mockResolvedValue(0) },
    };

    await expect(
      requireNonBatchManagedPosts(prisma as never, {
        workspaceId: 'workspace-1',
        postIds: ['post-1'],
      }),
    ).resolves.toBeUndefined();
  });
});
