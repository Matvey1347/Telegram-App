import { ValidationPipe } from '@nestjs/common';
import { CreateAdCampaignDto } from './dto';
import { shapeAdmissionViewAnalytics } from './ad-campaign-admission-view-read';
import { AdCampaignsService } from './ad-campaigns.service';

describe('AdCampaignsService.refreshInviteLinkData', () => {
  it('refreshes only links directly assigned to the campaign', async () => {
    const register = jest.fn().mockResolvedValue({ currentJoinedCount: 0, currentRequestedCount: 0 });
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
      totalLinks: 1,
      refreshedLinks: 1,
      failedLinks: [],
    });
    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenNthCalledWith(
      1,
      'user-1',
      'channel-1',
      'https://t.me/+one',
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
      1,
    );
  });

  it('reports individual refresh failures while preserving completed links', async () => {
    const register = jest
      .fn()
      .mockResolvedValueOnce({ currentJoinedCount: 0, currentRequestedCount: 0 })
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
    });

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
    });

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
      telegramChannel: { findMany: jest.fn().mockResolvedValue([]) },
      advertisingSource: { findMany: jest.fn().mockResolvedValue([]) },
      telegramInviteLink: { updateMany: jest.fn() },
      adCampaignPromo: { deleteMany: jest.fn() },
      transaction: { upsert: jest.fn() },
    };
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
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
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'campaign-1' });

    await expect(
      service.create('user-1', await new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }).transform({
        telegramChannelId: 'channel-1',
        trackingAllChannels: true,
        botInviteLinkIds: ['old-client-link'],
      }, { metatype: CreateAdCampaignDto, type: 'body' }) as CreateAdCampaignDto),
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
    expect(tx.adCampaign.create).not.toHaveBeenCalledWith({ data: expect.objectContaining({ trackingScope: expect.anything() }) });
    expect(tx.transaction.upsert).not.toHaveBeenCalled();
    expect(analytics.recalculateCampaignAnalytics).toHaveBeenCalledWith(
      'workspace-1',
      'campaign-1',
    );

    await expect(
      service.create('user-1', { telegramChannelId: 'channel-1', price: 100 }),
    ).rejects.toThrow('Select an account before setting a campaign cost');
  });
});

describe('campaign admission analytics summary', () => {
  it('uses the largest admission cohort instead of a later small delta', () => {
    const summary = shapeAdmissionViewAnalytics(
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

    expect(summary.latestBatch).toMatchObject({
      id: 'initial',
      baselineAvgViews: 12.25,
      currentAvgViews: 26.75,
      cumulativeAvgViewsUplift: 12.75,
    });
  });
});
