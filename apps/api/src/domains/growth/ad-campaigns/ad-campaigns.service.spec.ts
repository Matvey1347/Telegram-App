import { AdCampaignsService } from './ad-campaigns.service';

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
      transaction: { deleteMany: jest.fn().mockRejectedValue(new Error('db failure')) },
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

    await expect(service.remove('user-1', 'campaign-1')).rejects.toThrow('db failure');
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
        findFirst: jest.fn().mockResolvedValue({ id: 'advertising-1', name: 'Advertising' }),
      },
      transaction: { upsert: jest.fn().mockResolvedValue({ id: 'transaction-1' }) },
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
        findFirst: jest.fn().mockResolvedValue({ id: 'advertising-1', name: 'Advertising' }),
      },
      transaction: { upsert: jest.fn().mockResolvedValue({ id: 'transaction-1' }) },
    };
    const service = new AdCampaignsService(
      {} as never,
      {} as never,
      { ensureSystemCategories: jest.fn().mockResolvedValue(undefined) } as never,
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

    await (service as any).syncExpenseTransaction(tx, 'workspace-1', editedCampaign);
    expect(tx.transaction.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { adCampaignId: 'campaign-1' },
        update: expect.objectContaining({
          accountId: 'account-2', amount: 200, currency: 'USD',
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
      { ensureSystemCategories: jest.fn().mockResolvedValue(undefined) } as never,
      {} as never,
    );

    await expect(
      (service as any).syncExpenseTransaction(tx, 'workspace-1', campaign),
    ).rejects.toThrow('Advertising transaction category not found');
    expect(tx.transaction.upsert).not.toHaveBeenCalled();
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
