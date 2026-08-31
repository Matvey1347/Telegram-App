import { GlobalSearchService } from './global-search.service';

function repository(result: unknown[] = []) {
  return { findMany: jest.fn().mockResolvedValue(result) };
}

describe('GlobalSearchService permissions', () => {
  it('queries and returns only search surfaces from accessible features', async () => {
    const prisma = {
      transaction: repository(),
      workspaceMember: repository(),
      telegramChannel: repository([
        {
          id: 'channel-1',
          title: 'Allowed channel',
          username: 'allowed',
          photoUrl: null,
          adminLinks: [{ id: 'admin-link' }],
        },
      ]),
      telegramUserAccountIntegration: repository(),
      telegramBotIntegration: repository(),
      promo: repository(),
      advertisingSource: repository(),
      adCampaign: repository(),
      adHypothesis: repository(),
      telegramManagedPost: repository(),
      postGroup: repository(),
      icon: repository(),
    };
    const authorization = {
      context: jest.fn().mockResolvedValue({
        workspaceId: 'workspace-1',
        featureIds: ['dashboard', 'channels'],
      }),
    };
    const result = await new GlobalSearchService(
      prisma as never,
      authorization as never,
    ).search('user-1', 'allow');

    expect(result).toEqual([
      expect.objectContaining({ id: 'channel-1', type: 'telegram-channel' }),
    ]);
    expect(prisma.telegramChannel.findMany).toHaveBeenCalledTimes(1);
    expect(
      prisma.telegramUserAccountIntegration.findMany,
    ).toHaveBeenCalledTimes(1);
    expect(prisma.transaction.findMany).not.toHaveBeenCalled();
    expect(prisma.workspaceMember.findMany).not.toHaveBeenCalled();
    expect(prisma.telegramBotIntegration.findMany).not.toHaveBeenCalled();
    expect(prisma.adCampaign.findMany).not.toHaveBeenCalled();
    expect(prisma.telegramManagedPost.findMany).not.toHaveBeenCalled();
  });

  it('does not resolve authorization or query data for an unusably short query', async () => {
    const prisma = { transaction: repository() };
    const authorization = { context: jest.fn() };
    const result = await new GlobalSearchService(
      prisma as never,
      authorization as never,
    ).search('user-1', 'a');
    expect(result).toEqual([]);
    expect(authorization.context).not.toHaveBeenCalled();
    expect(prisma.transaction.findMany).not.toHaveBeenCalled();
  });

  it('returns post groups without the removed prompt-note count', async () => {
    const prisma = {
      transaction: repository(),
      workspaceMember: repository(),
      telegramChannel: repository(),
      telegramUserAccountIntegration: repository(),
      telegramBotIntegration: repository(),
      promo: repository(),
      advertisingSource: repository(),
      adCampaign: repository(),
      adHypothesis: repository(),
      telegramManagedPost: repository(),
      postGroup: repository([
        {
          id: 'group-1',
          telegramChannelId: 'channel-1',
          title: 'Content plan',
          icon: null,
          telegramChannel: {
            id: 'channel-1',
            title: 'Allowed channel',
            photoUrl: null,
          },
          _count: { posts: 2 },
        },
      ]),
      icon: repository(),
    };
    const authorization = {
      context: jest.fn().mockResolvedValue({
        workspaceId: 'workspace-1',
        featureIds: ['posts'],
      }),
    };

    const result = await new GlobalSearchService(
      prisma as never,
      authorization as never,
    ).search('user-1', 'content');

    expect(result).toEqual([
      expect.objectContaining({
        id: 'group-1',
        type: 'post-group',
        subtitle: 'Allowed channel · 2 posts',
      }),
    ]);
    expect(prisma.postGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          _count: { select: { posts: true } },
        }),
      }),
    );
  });
});
