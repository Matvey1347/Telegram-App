import { DashboardService } from './dashboard.service';
import { dashboardIsoDay } from './dashboard-period';

describe('DashboardService', () => {
  it('preserves the dashboard contract while sharing one mixed-currency graph', async () => {
    const from = new Date('2026-01-01T00:00:00');
    const to = new Date('2026-01-02T23:59:59.999');
    const channel = {
      id: 'channel-1',
      title: 'Channel',
      username: 'channel',
      photoUrl: null,
      currentSubscribersCount: 80,
      isActive: true,
      purchaseTransaction: { amountInPrimaryCurrency: 500 },
      adminLinks: [{ id: 'admin-1' }],
      audienceSnapshots: [
        {
          subscribersCount: 100,
          activeSubscribersEstimate: 60,
          viewRate: 0.5,
          dataQuality: 'good',
          hasExternalTrafficAnomaly: false,
        },
      ],
    };
    const campaign = {
      id: 'campaign-1',
      status: 'completed',
      placementDate: new Date('2026-01-02T12:00:00'),
      startedAt: null,
      createdAt: new Date('2025-12-01T12:00:00'),
      telegramInviteLinkId: 'link-1',
      inviteLinks: [{ joinedCount: 3, requestedCount: 2 }],
      joinedCount: 2,
      price: 200,
      priceInPrimaryCurrency: 200,
      currency: 'USD',
      telegramChannel: {
        id: 'channel-1',
        title: 'Channel',
        username: 'channel',
        photoUrl: null,
        kpiCurrency: 'USD',
        targetCpaFrom: null,
        targetCpa: 40,
        acceptableCpaFrom: null,
        acceptableCpa: 60,
        stopCpaFrom: null,
        stopCpa: 80,
      },
      promo: null,
    };
    const reads = {
      load: jest.fn().mockResolvedValue({
        workspace: { primaryCurrency: 'USD', secondaryCurrency: 'UAH' },
        periodTransactions: [
          {
            date: new Date('2026-01-01T12:00:00'),
            type: 'income',
            amountInPrimaryCurrency: 300,
            telegramChannelId: 'channel-1',
            category: 'Channel advertising revenue',
            categoryId: 'revenue-category',
            categoryRef: {
              key: 'channel_advertising_revenue',
              name: 'Channel advertising revenue',
              iconId: null,
              icon: null,
            },
          },
          {
            date: new Date('2026-01-01T14:00:00'),
            type: 'income',
            amountInPrimaryCurrency: 60,
            telegramChannelId: null,
            category: 'Telegram affiliate revenue',
            categoryId: 'affiliate-category',
            categoryRef: {
              key: 'telegram_affiliate_revenue',
              name: 'Telegram affiliate revenue',
              iconId: null,
              icon: null,
            },
          },
          {
            date: new Date('2026-01-01T15:00:00'),
            type: 'income',
            amountInPrimaryCurrency: 1_000,
            telegramChannelId: null,
            category: 'Investment',
            categoryId: 'investment-category',
            categoryRef: {
              key: 'investment',
              name: 'Investment',
              iconId: null,
              icon: null,
            },
          },
          {
            date: new Date('2026-01-01T16:00:00'),
            type: 'income',
            amountInPrimaryCurrency: 5_773,
            telegramChannelId: null,
            category: 'Fixing Balance',
            categoryId: null,
            categoryRef: null,
          },
          {
            date: new Date('2026-01-02T12:00:00'),
            type: 'expense',
            amountInPrimaryCurrency: 100,
            telegramChannelId: null,
            category: 'Operations',
            categoryId: 'expense-category',
            categoryRef: {
              key: 'operations',
              name: 'Operations',
              iconId: null,
              icon: null,
            },
          },
        ],
        periodCampaigns: [campaign],
        channels: [channel],
        members: 3,
        periodInvestments: [
          {
            id: 'investment-1',
            date: new Date('2026-01-01T13:00:00'),
            amount: 50,
            currency: 'USD',
            amountInPrimaryCurrency: 50,
            origin: 'EXTERNAL',
            movementType: 'CONTRIBUTION',
            notes: null,
            workspaceMember: {
              id: 'member-1',
              user: { name: 'Investor' },
            },
            account: { id: 'account-1', name: 'EUR account', currency: 'EUR' },
          },
        ],
        accountRows: [
          {
            account: {
              id: 'account-1',
              name: 'EUR account',
              currency: 'EUR',
              iconId: null,
              icon: null,
            },
            balance: 125,
          },
        ],
        campaignStatusCounts: { completed: 2, active: 1 },
        campaignsCount: 3,
        hypothesisStatusCounts: { testing: 2 },
        totalInvestedPrimary: 500,
        operatingProfitAllTime: 200,
        cumulativeBeforePeriod: 10,
        revenueByChannel: new Map([['channel-1', 400]]),
      }),
      loadSelectedInviteLinks: jest
        .fn()
        .mockResolvedValue([
          { id: 'link-1', joinedCount: 7, requestedCount: 9 },
        ]),
    };
    const convertCurrency = jest.fn(
      (amount: number, _from: string, toCurrency: string) =>
        Promise.resolve(toCurrency === 'USD' ? amount * 2 : amount * 40),
    );
    const conversion = {
      prepareRateSource: jest.fn().mockResolvedValue({ convertCurrency }),
    };
    const workspace = {
      resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
    };
    const service = new DashboardService(
      workspace as never,
      conversion as never,
      reads as never,
    );

    const result = await service.summary('user-1', {
      dateFrom: '2026-01-01',
      dateTo: '2026-01-02',
    });

    expect(workspace.resolveWorkspaceIdForUser).toHaveBeenCalledWith('user-1');
    expect(reads.load).toHaveBeenCalledWith('workspace-1', from, to);
    expect(reads.loadSelectedInviteLinks).toHaveBeenCalledWith('workspace-1', [
      'link-1',
    ]);
    expect(conversion.prepareRateSource).toHaveBeenCalledTimes(1);
    expect(convertCurrency).toHaveBeenCalledTimes(2);
    expect(result).toEqual(
      expect.objectContaining({
        period: {
          dateFrom: dashboardIsoDay(from),
          dateTo: dashboardIsoDay(to),
        },
        totalBalancePrimary: 250,
        totalBalanceSecondary: 5000,
        incomeForPeriod: 360,
        incomeBreakdownForPeriod: { channels: 300, other: 60 },
        excludedBalanceAdjustmentsForPeriod: 5_773,
        revenuePerActiveSubscriber: 300 / 60,
        expensesForPeriod: 100,
        expensesBreakdownForPeriod: { channels: 0, other: 100 },
        profitForPeriod: 260,
        investedCapital: 500,
        investedCapitalForPeriod: 50,
        operatingProfitAllTime: 200,
        remainingToBreakEven: 300,
        totalJoinedFromAds: 7,
        campaignsCount: 3,
        periodCampaignsCount: 1,
        campaignStatusCounts: { completed: 2, active: 1 },
        hypothesisStatusCounts: { testing: 2 },
      }),
    );
    expect(result.accountBalances[0]).toEqual(
      expect.objectContaining({ balance: 125, primary: 250, secondary: 5000 }),
    );
    expect(result.channelPerformance[0]).toEqual(
      expect.objectContaining({
        revenue: 300,
        allTimeRevenue: 400,
        spend: 200,
        net: 100,
        remainingToBreakEven: 100,
      }),
    );
    expect(result.dailyTrend.reduce((sum, row) => sum + row.income, 0)).toBe(
      360,
    );
    expect(result.dailyTrend.at(-1)?.cumulativeProfitAfterInvestments).toBe(
      -730,
    );
    expect(result.bestCampaigns[0]).toEqual(
      expect.objectContaining({ joinedCount: 7, cpa: 200 / 7 }),
    );
  });

  it('revalues native amounts after a primary-currency change and counts investment transactions', async () => {
    const investmentDate = new Date('2026-09-09T12:00:00');
    const reads = {
      load: jest.fn().mockResolvedValue({
        workspace: { primaryCurrency: 'UAH', secondaryCurrency: 'USD' },
        periodTransactions: [
          {
            date: new Date('2026-09-08T12:00:00'),
            type: 'income',
            amount: 1_050,
            currency: 'UAH',
            amountInPrimaryCurrency: 23.6,
            telegramChannelId: null,
            category: 'Channel advertising revenue',
            categoryId: 'revenue-category',
            categoryRef: {
              key: 'channel_advertising_revenue',
              name: 'Channel advertising revenue',
            },
          },
          {
            date: new Date('2026-09-08T13:00:00'),
            type: 'expense',
            amount: 500,
            currency: 'UAH',
            amountInPrimaryCurrency: 11.2,
            telegramChannelId: null,
            category: 'Advertising',
            categoryId: 'advertising-category',
            categoryRef: { key: 'advertising', name: 'Advertising' },
          },
          {
            date: investmentDate,
            type: 'income',
            amount: 2_500,
            currency: 'PLN',
            amountInPrimaryCurrency: 57,
            telegramChannelId: null,
            category: 'Investment',
            categoryId: 'investment-category',
            categoryRef: { key: 'investment', name: 'Investment' },
          },
        ],
        periodCampaigns: [],
        channels: [
          {
            id: 'channel-1',
            title: 'Channel',
            username: null,
            photoUrl: null,
            currentSubscribersCount: 2_500,
            isActive: true,
            purchaseTransaction: null,
            adminLinks: [{ id: 'admin-1' }],
            audienceSnapshots: [
              {
                subscribersCount: 2_500,
                activeSubscribersEstimate: 2_100,
                viewRate: 0.5,
                dataQuality: 'good',
                hasExternalTrafficAnomaly: false,
              },
            ],
          },
        ],
        members: 1,
        periodInvestments: [
          {
            id: 'investment-1',
            date: investmentDate,
            amount: 2_500,
            currency: 'PLN',
            amountInPrimaryCurrency: 25_000,
            origin: 'EXTERNAL',
            movementType: 'CONTRIBUTION',
            notes: null,
            workspaceMember: {
              id: 'member-1',
              user: { name: 'Investor' },
            },
            account: null,
          },
        ],
        accountRows: [],
        campaignStatusCounts: {},
        campaignsCount: 0,
        hypothesisStatusCounts: {},
        totalInvestedPrimary: 0,
        operatingProfitAllTime: 0,
        cumulativeBeforePeriod: 0,
        revenueByChannel: new Map(),
      }),
      loadSelectedInviteLinks: jest.fn().mockResolvedValue([]),
    };
    const historicalSource = {
      convertCurrency: jest
        .fn()
        .mockImplementation((amount: number) => Promise.resolve(amount * 10)),
    };
    const conversion = {
      prepareHistoricalRateSources: jest
        .fn()
        .mockResolvedValue(
          new Map([[investmentDate.toISOString(), historicalSource]]),
        ),
      prepareRateSource: jest.fn(),
    };
    const service = new DashboardService(
      {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
      } as never,
      conversion as never,
      reads as never,
    );

    const result = await service.summary('user-1', {
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
    });

    expect(result).toEqual(
      expect.objectContaining({
        primaryCurrency: 'UAH',
        incomeForPeriod: 1_050,
        incomeBreakdownForPeriod: { channels: 1_050, other: 0 },
        excludedBalanceAdjustmentsForPeriod: 0,
        expensesForPeriod: 500,
        expensesBreakdownForPeriod: { channels: 500, other: 0 },
        investedCapitalForPeriod: 25_000,
        revenuePerActiveSubscriber: 0.5,
      }),
    );
    expect(conversion.prepareHistoricalRateSources).toHaveBeenCalledWith(
      'workspace-1',
      [investmentDate],
    );
    expect(conversion.prepareRateSource).not.toHaveBeenCalled();
  });

  it('returns no per-subscriber revenue when the active audience is empty', async () => {
    const reads = {
      load: jest.fn().mockResolvedValue({
        workspace: { primaryCurrency: 'USD', secondaryCurrency: 'EUR' },
        periodTransactions: [],
        periodCampaigns: [],
        channels: [],
        members: 0,
        periodInvestments: [],
        accountRows: [],
        campaignStatusCounts: {},
        campaignsCount: 0,
        hypothesisStatusCounts: {},
        totalInvestedPrimary: 0,
        operatingProfitAllTime: 0,
        cumulativeBeforePeriod: 0,
        revenueByChannel: new Map(),
      }),
      loadSelectedInviteLinks: jest.fn().mockResolvedValue([]),
    };
    const service = new DashboardService(
      {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
      } as never,
      {} as never,
      reads as never,
    );

    const result = await service.summary('user-1', {
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
    });

    expect(result.revenuePerActiveSubscriber).toBeNull();
  });

  it('requires dashboard access before executing dashboard reads', async () => {
    const denied = new Error('denied');
    const authorization = { require: jest.fn().mockRejectedValue(denied) };
    const reads = { load: jest.fn() };
    const service = new DashboardService(
      {} as never,
      {} as never,
      reads as never,
      authorization as never,
    );

    await expect(service.summary('user-1')).rejects.toBe(denied);
    expect(authorization.require).toHaveBeenCalledWith(
      'user-1',
      'dashboard.view',
    );
    expect(reads.load).not.toHaveBeenCalled();
  });
});
