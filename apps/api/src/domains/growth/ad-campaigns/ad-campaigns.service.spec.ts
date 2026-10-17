import { AdCampaignsService } from './ad-campaigns.service';
import { AdCampaignListReadService } from './ad-campaign-list-read.service';

describe('AdCampaignsService.refreshInviteLinkData', () => {
  it('refreshes each acquisition and bot-tracking link once before returning the campaign', async () => {
    const register = jest.fn().mockResolvedValue({});
    const onProgress = jest.fn();
    const prisma = {
      adCampaign: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'campaign-1',
          inviteLinks: [
            { telegramChannelId: 'channel-1', url: 'https://t.me/+one' },
          ],
          botInviteLinks: [
            {
              inviteLink: {
                telegramChannelId: 'channel-2',
                url: 'https://t.me/+two',
              },
            },
            {
              inviteLink: {
                telegramChannelId: 'channel-1',
                url: 'https://t.me/+one',
              },
            },
          ],
        }),
      },
    };
    const service = new AdCampaignsService(
      prisma as never,
      {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
      } as never,
      {} as never,
      {} as never,
      undefined,
      { register } as never,
    );
    await expect(
      service.refreshInviteLinkData('user-1', 'campaign-1', onProgress),
    ).resolves.toEqual({
      campaignId: 'campaign-1',
      totalLinks: 2,
      refreshedLinks: 2,
      failedLinks: [],
    });
    expect(register).toHaveBeenCalledTimes(2);
    expect(register).toHaveBeenNthCalledWith(
      1,
      'user-1',
      'channel-1',
      'https://t.me/+one',
    );
    expect(register).toHaveBeenNthCalledWith(
      2,
      'user-1',
      'channel-2',
      'https://t.me/+two',
    );
    expect(onProgress).toHaveBeenNthCalledWith(
      1,
      {
        telegramChannelId: 'channel-1',
        url: 'https://t.me/+one',
        status: 'refreshed',
        message: 'Invite link refreshed',
      },
      1,
      2,
    );
    expect(onProgress).toHaveBeenNthCalledWith(
      2,
      {
        telegramChannelId: 'channel-2',
        url: 'https://t.me/+two',
        status: 'refreshed',
        message: 'Invite link refreshed',
      },
      2,
      2,
    );
  });

  it('reports individual refresh failures while preserving completed links', async () => {
    const register = jest
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(
        new Error(
          '400: CHAT_ADMIN_REQUIRED (caused by messages.GetExportedChatInvite)',
        ),
      );
    const prisma = {
      adCampaign: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'campaign-1',
          inviteLinks: [
            { telegramChannelId: 'channel-1', url: 'https://t.me/+one' },
            { telegramChannelId: 'channel-2', url: 'https://t.me/+two' },
          ],
          botInviteLinks: [],
        }),
      },
    };
    const onProgress = jest.fn();
    const service = new AdCampaignsService(
      prisma as never,
      {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
      } as never,
      {} as never,
      {} as never,
      undefined,
      { register } as never,
    );

    await expect(
      service.refreshInviteLinkData('user-1', 'campaign-1', onProgress),
    ).resolves.toEqual({
      campaignId: 'campaign-1',
      totalLinks: 2,
      refreshedLinks: 1,
      failedLinks: [
        {
          telegramChannelId: 'channel-2',
          url: 'https://t.me/+two',
          message:
            'The connected Telegram account must be an administrator of this channel.',
        },
      ],
    });
    expect(onProgress).toHaveBeenLastCalledWith(
      {
        telegramChannelId: 'channel-2',
        url: 'https://t.me/+two',
        status: 'failed',
        message:
          'The connected Telegram account must be an administrator of this channel.',
      },
      2,
      2,
    );
  });
});

describe('AdCampaignsService.remove', () => {
  it('deletes only the linked generated expense transaction with the campaign', async () => {
    const transaction = {
      transaction: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      adCampaign: {
        delete: jest.fn().mockResolvedValue({ id: 'campaign-1' }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback) => callback(transaction)),
    };
    const service = new AdCampaignsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'campaign-1',
      workspaceId: 'workspace-1',
    } as never);

    await expect(service.remove('user-1', 'campaign-1')).resolves.toEqual({
      id: 'campaign-1',
    });
    expect(transaction.transaction.deleteMany).toHaveBeenCalledWith({
      where: { workspaceId: 'workspace-1', adCampaignId: 'campaign-1' },
    });
    expect(transaction.adCampaign.delete).toHaveBeenCalledWith({
      where: { id: 'campaign-1' },
    });
  });

  it('does not delete the campaign when deleting its generated expense fails', async () => {
    const transaction = {
      transaction: {
        deleteMany: jest.fn().mockRejectedValue(new Error('db failure')),
      },
      adCampaign: { delete: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (callback) => callback(transaction)),
    };
    const service = new AdCampaignsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'campaign-1',
      workspaceId: 'workspace-1',
    } as never);

    await expect(service.remove('user-1', 'campaign-1')).rejects.toThrow(
      'db failure',
    );
    expect(transaction.adCampaign.delete).not.toHaveBeenCalled();
  });
});

describe('AdCampaignsService campaign expense transaction', () => {
  const campaign = {
    id: 'campaign-1',
    accountId: 'account-1',
    title: 'Campaign',
    placementDate: new Date('2026-08-20T00:00:00.000Z'),
    assignedMemberId: 'member-1',
    price: 125,
    currency: 'UAH',
    exchangeRateToPrimary: 0.024,
    priceInPrimaryCurrency: 3,
  };

  it('upserts the explicit linked expense with the campaign account, amount and currency on retries', async () => {
    const tx = {
      account: { findFirst: jest.fn().mockResolvedValue({ id: 'account-1' }) },
      transactionCategory: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'advertising-1', name: 'Advertising' }),
      },
      transaction: {
        upsert: jest.fn().mockResolvedValue({ id: 'transaction-1' }),
      },
    };
    const financeCategoriesService = {
      ensureSystemCategories: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AdCampaignsService(
      {} as never,
      {} as never,
      financeCategoriesService as never,
      {} as never,
    );

    await (service as any).syncExpenseTransaction(tx, 'workspace-1', campaign);
    await (service as any).syncExpenseTransaction(tx, 'workspace-1', campaign);
    expect(tx.transaction.upsert).toHaveBeenCalledTimes(2);
    expect(tx.transaction.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { adCampaignId: 'campaign-1' },
        create: expect.objectContaining({
          adCampaignId: 'campaign-1',
          accountId: 'account-1',
          amount: 125,
          currency: 'UAH',
        }),
        update: expect.objectContaining({
          adCampaignId: 'campaign-1',
          accountId: 'account-1',
          amount: 125,
          currency: 'UAH',
        }),
      }),
    );
  });

  it('synchronizes edited amount, currency and account through the same linked transaction', async () => {
    const tx = {
      account: { findFirst: jest.fn().mockResolvedValue({ id: 'account-2' }) },
      transactionCategory: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'advertising-1', name: 'Advertising' }),
      },
      transaction: {
        upsert: jest.fn().mockResolvedValue({ id: 'transaction-1' }),
      },
    };
    const service = new AdCampaignsService(
      {} as never,
      {} as never,
      {
        ensureSystemCategories: jest.fn().mockResolvedValue(undefined),
      } as never,
      {} as never,
    );
    const editedCampaign = {
      ...campaign,
      accountId: 'account-2',
      price: 200,
      currency: 'USD',
      exchangeRateToPrimary: 1,
      priceInPrimaryCurrency: 200,
    };

    await (service as any).syncExpenseTransaction(
      tx,
      'workspace-1',
      editedCampaign,
    );
    expect(tx.transaction.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { adCampaignId: 'campaign-1' },
        update: expect.objectContaining({
          accountId: 'account-2',
          amount: 200,
          currency: 'USD',
        }),
      }),
    );
  });

  it('fails the enclosing campaign transaction instead of silently omitting its expense', async () => {
    const tx = {
      account: { findFirst: jest.fn().mockResolvedValue({ id: 'account-1' }) },
      transactionCategory: { findFirst: jest.fn().mockResolvedValue(null) },
      transaction: { upsert: jest.fn() },
    };
    const service = new AdCampaignsService(
      {} as never,
      {} as never,
      {
        ensureSystemCategories: jest.fn().mockResolvedValue(undefined),
      } as never,
      {} as never,
    );

    await expect(
      (service as any).syncExpenseTransaction(tx, 'workspace-1', campaign),
    ).rejects.toThrow('Advertising transaction category not found');
    expect(tx.transaction.upsert).not.toHaveBeenCalled();
  });
});

describe('AdCampaignsService campaign creation without a cost', () => {
  it('creates a planned campaign without an account or an expense transaction', async () => {
    const tx = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ primaryCurrency: 'USD' }),
      },
      adCampaign: {
        create: jest.fn().mockResolvedValue({ id: 'campaign-1' }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback) => callback(tx)),
    };
    const analytics = { recalculateCampaignAnalytics: jest.fn() };
    const workspace = {
      resolveAssignedMemberId: jest.fn().mockResolvedValue({
        workspaceId: 'workspace-1',
        assignedMemberId: null,
      }),
    };
    const service = new AdCampaignsService(
      prisma as never,
      workspace as never,
      {} as never,
      analytics as never,
    );
    jest
      .spyOn(service as any, 'ensurePromosBelongToChannel')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'ensureInviteLinksBelongToChannel')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'ensureAdvertisingSources')
      .mockResolvedValue({ channelIds: [], sourceIds: [] });
    jest
      .spyOn(service as any, 'generateCampaignTitle')
      .mockResolvedValue('Campaign');
    jest
      .spyOn(service as any, 'replaceCampaignPromos')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'replaceCampaignInviteLinks')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'replaceCampaignTrackingInviteLinks')
      .mockResolvedValue(undefined);
    const syncExpense = jest
      .spyOn(service as any, 'syncExpenseTransaction')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service, 'findOne')
      .mockResolvedValue({ id: 'campaign-1' } as never);

    await expect(
      service.create('user-1', { telegramChannelId: 'channel-1' }),
    ).resolves.toEqual({ id: 'campaign-1' });

    expect(tx.adCampaign.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        price: 0,
        currency: 'USD',
        exchangeRateToPrimary: 1,
        priceInPrimaryCurrency: 0,
        accountId: null,
      }),
    });
    expect(syncExpense).not.toHaveBeenCalled();
    expect(analytics.recalculateCampaignAnalytics).toHaveBeenCalledWith(
      'workspace-1',
      'campaign-1',
    );

    await expect(
      service.create('user-1', { telegramChannelId: 'channel-1', price: 100 }),
    ).rejects.toThrow('Select an account before setting a campaign cost');
  });
});

describe('AdCampaignListReadService bot request performance', () => {
  it('uses the saved bot-link baseline instead of counting the link lifetime', async () => {
    const prisma = {
      telegramInviteLinkSnapshot: {
        findMany: jest.fn().mockResolvedValue([
          {
            inviteLinkId: 'bot-link',
            syncedAt: new Date('2026-10-01T00:00:00Z'),
            joinedCount: 0,
            requestedCount: 8,
          },
          {
            inviteLinkId: 'bot-link',
            syncedAt: new Date('2026-10-02T00:00:00Z'),
            joinedCount: 1,
            requestedCount: 3,
          },
          {
            inviteLinkId: 'bot-link',
            syncedAt: new Date('2026-10-03T00:00:00Z'),
            joinedCount: 1,
            requestedCount: 9,
          },
        ]),
      },
    };
    const reader = new AdCampaignListReadService(prisma as never, {} as never);
    const result = await (reader as any).loadBotRequestMetrics('workspace-1', [
      {
        id: 'campaign-1',
        placementDate: new Date('2026-10-01T12:00:00Z'),
        startedAt: null,
        endedAt: null,
        createdAt: new Date('2026-10-01T00:00:00Z'),
        botInviteLinks: [
          {
            inviteLink: {
              id: 'bot-link',
              telegramChannelId: 'channel-1',
              joinedCount: 1,
              requestedCount: 9,
              telegramChannel: { title: 'Bot channel' },
            },
            baselineJoinedCount: 0,
            baselineRequestedCount: 8,
          },
        ],
      },
    ]);

    expect(result.get('campaign-1')).toMatchObject({
      total: 2,
      points: expect.arrayContaining([
        expect.objectContaining({
          syncedAt: '2026-10-01T12:00:00.000Z',
          totalAttributed: 0,
        }),
        expect.objectContaining({
          syncedAt: '2026-10-03T00:00:00.000Z',
          totalAttributed: 2,
        }),
      ]),
      channels: [
        {
          telegramChannelId: 'channel-1',
          title: 'Bot channel',
          requests: 2,
          peak: 2,
        },
      ],
    });
  });

  it('keeps all campaign bot links in the result after the placement ends', async () => {
    const prisma = {
      telegramInviteLinkSnapshot: {
        findMany: jest.fn().mockResolvedValue([
          {
            inviteLinkId: 'synced-link',
            syncedAt: new Date('2026-10-13T00:00:00Z'),
            joinedCount: 0,
            requestedCount: 26,
          },
        ]),
      },
    };
    const reader = new AdCampaignListReadService(prisma as never, {} as never);
    const result = await (reader as any).loadBotRequestMetrics('workspace-1', [
      {
        id: 'campaign-1',
        placementDate: new Date('2026-10-10T00:00:00Z'),
        startedAt: null,
        endedAt: new Date('2026-10-12T00:00:00Z'),
        createdAt: new Date('2026-10-10T00:00:00Z'),
        botInviteLinks: [
          {
            inviteLink: {
              id: 'synced-link',
              telegramChannelId: 'channel-1',
              joinedCount: 0,
              requestedCount: 26,
              telegramChannel: { title: 'Synced channel' },
            },
            baselineJoinedCount: 0,
            baselineRequestedCount: 0,
          },
          {
            inviteLink: {
              id: 'live-only-link',
              telegramChannelId: 'channel-2',
              joinedCount: 0,
              requestedCount: 29,
              telegramChannel: { title: 'Live-only channel' },
            },
            baselineJoinedCount: 0,
            baselineRequestedCount: 0,
          },
        ],
      },
    ]);

    expect(result.get('campaign-1')).toMatchObject({
      total: 55,
      channels: expect.arrayContaining([
        expect.objectContaining({
          telegramChannelId: 'channel-1',
          requests: 26,
          peak: 26,
        }),
        expect.objectContaining({
          telegramChannelId: 'channel-2',
          requests: 29,
          peak: 29,
        }),
      ]),
    });
  });
});

describe('AdCampaignsService admission analytics summary', () => {
  it('uses the largest admission cohort instead of a later small delta', () => {
    const service = new AdCampaignsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    ) as any;

    const summary = service.shapeAdmissionViewAnalytics(
      [
        {
          id: 'initial',
          startedAt: new Date('2026-07-22T00:00:00.000Z'),
          releasedSubscribersCount: 125,
          baselineAvgViews: 12.25,
          trackedPostsCount: 5,
          viewSnapshots: [
            {
              collectedAt: new Date('2026-07-23T00:00:00.000Z'),
              avgViews: 26.75,
              cumulativeAvgViewsUplift: 12.75,
              incrementalAvgViewsUplift: 5.5,
            },
          ],
        },
        {
          id: 'later',
          startedAt: new Date('2026-07-30T00:00:00.000Z'),
          releasedSubscribersCount: 13,
          baselineAvgViews: 55.4,
          trackedPostsCount: 5,
          viewSnapshots: [
            {
              collectedAt: new Date('2026-07-30T21:30:00.000Z'),
              avgViews: 143.4,
              cumulativeAvgViewsUplift: 0,
              incrementalAvgViewsUplift: 0,
            },
          ],
        },
      ],
      30,
      113,
    );

    expect(summary.latestBatch.id).toBe('initial');
    expect(summary.latestBatch.baselineAvgViews).toBe(12.25);
    expect(summary.latestBatch.currentAvgViews).toBe(26.75);
    expect(summary.latestBatch.cumulativeAvgViewsUplift).toBe(12.75);
  });
});
