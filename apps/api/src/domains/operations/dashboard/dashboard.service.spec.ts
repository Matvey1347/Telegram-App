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
            amountInPrimaryCurrency: 50,
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
        incomeForPeriod: 300,
        expensesForPeriod: 100,
        profitForPeriod: 200,
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
      300,
    );
    expect(result.dailyTrend.at(-1)?.cumulativeProfitAfterInvestments).toBe(
      160,
    );
    expect(result.bestCampaigns[0]).toEqual(
      expect.objectContaining({ joinedCount: 7, cpa: 200 / 7 }),
    );
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
    expect(authorization.require).toHaveBeenCalledWith('user-1', 'dashboard.view');
    expect(reads.load).not.toHaveBeenCalled();
  });
});
