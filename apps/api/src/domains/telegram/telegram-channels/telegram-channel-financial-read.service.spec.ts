import { TelegramChannelFinancialReadService } from './telegram-channel-financial-read.service';

describe('TelegramChannelFinancialReadService', () => {
  it('uses linked ledger transactions for purchase price, ad spend, and revenue', async () => {
    const prisma = {
      adCampaign: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'campaign-1',
            telegramChannelId: 'channel-1',
            priceInPrimaryCurrency: 999_999,
            currency: 'UAH',
            price: 999_999,
            status: 'finished',
            joinedCount: 0,
            newSubscribers: 0,
            cappedActiveSubscribersFromAd: null,
            activeSubscribersFromAd: null,
            activeRate: null,
            retention7d: null,
          },
        ]),
      },
      telegramInviteLink: {
        findMany: jest.fn().mockResolvedValue([
          {
            telegramChannelId: 'channel-1',
            adCampaignId: 'campaign-1',
            joinedCount: 0,
            requestedCount: 281,
          },
        ]),
      },
      telegramAdSalePaymentAllocation: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      transaction: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'purchase-1',
            telegramChannelId: null,
            type: 'expense',
            amount: 21_000,
            currency: 'UAH',
            amountInPrimaryCurrency: 468.72,
            categoryRef: { key: 'buy_channels', name: 'Buy channels' },
            adCampaign: null,
          },
          {
            id: 'ad-expense-1',
            telegramChannelId: null,
            type: 'expense',
            amount: 11_400,
            currency: 'UAH',
            amountInPrimaryCurrency: 255.29,
            categoryRef: { key: 'advertising', name: 'Advertising' },
            adCampaign: { telegramChannelId: 'channel-1' },
          },
          {
            id: 'revenue-1',
            telegramChannelId: 'channel-1',
            type: 'income',
            amount: 8_000,
            currency: 'UAH',
            amountInPrimaryCurrency: 179.1,
            categoryRef: {
              key: 'channel_advertising_revenue',
              name: 'Channel advertising revenue',
            },
            adCampaign: null,
          },
        ]),
      },
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ primaryCurrency: 'USD' }),
      },
    };
    const currency = {
      getRate: jest.fn(),
      convertCurrency: jest.fn(),
    };
    const service = new TelegramChannelFinancialReadService(
      prisma as never,
      currency as never,
      { windowsForChannels: jest.fn().mockResolvedValue(new Map()) } as never,
    );

    const summaries = await service.buildChannelFinancialSummaryPreview(
      'workspace-1',
      [
        {
          id: 'channel-1',
          purchaseTransactionId: 'purchase-1',
          currentSubscribersCount: 1_000,
          ownViewsPerPost: 10_000,
          adBaseCpm: null,
          kpiCurrency: 'UAH',
          targetCpa: 9,
          stopCpaFrom: 12,
          audienceSnapshots: [],
        },
      ],
    );

    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-1',
          OR: expect.arrayContaining([
            { id: { in: ['purchase-1'] } },
            {
              adCampaign: {
                telegramChannelId: { in: ['channel-1'] },
                excludeFromAnalytics: false,
              },
            },
          ]),
        }),
      }),
    );
    expect(summaries.get('channel-1')).toMatchObject({
      acquisitionCost: 21_000,
      totalAdSpend: 11_400,
      totalSpend: 32_400,
      currency: 'UAH',
      totalAttributedSubscribers: 281,
      avgCpa: 11_400 / 281,
      kpiStatus: 'bad',
      assetEconomics: {
        currency: 'UAH',
        purchasePrice: 21_000,
        adSpend: 11_400,
        invested: 32_400,
        revenue: 8_000,
      },
    });

    const normalized = await service.buildChannelFinancialSummaryPreview(
      'workspace-1',
      [
        {
          id: 'channel-1',
          purchaseTransactionId: 'purchase-1',
          currentSubscribersCount: 1_000,
          ownViewsPerPost: 10_000,
          adBaseCpm: null,
          kpiCurrency: 'UAH',
          targetCpa: 9,
          stopCpaFrom: 12,
          audienceSnapshots: [],
        },
      ],
      { normalizeToPrimaryCurrency: true },
    );
    expect(normalized.get('channel-1')?.assetEconomics).toMatchObject({
      currency: 'USD',
      purchasePrice: 468.72,
      adSpend: 255.29,
      invested: 724.01,
      revenue: 179.1,
    });
  });

  it('counts every active ad-sale allocation and falls back from zero own views for ad pricing', async () => {
    const allocations = Array.from({ length: 13 }, () => ({
      amount: 60,
      currency: 'UAH',
      amountInPrimaryCurrency: 1.35,
      placement: { telegramChannelId: 'channel-1' },
    }));
    const prisma = {
      adCampaign: { findMany: jest.fn().mockResolvedValue([]) },
      telegramInviteLink: { findMany: jest.fn().mockResolvedValue([]) },
      transaction: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'ad-sale-transaction-visible-on-channel',
            telegramChannelId: 'channel-1',
            type: 'income',
            amount: 60,
            currency: 'UAH',
            amountInPrimaryCurrency: 1.35,
            categoryRef: {
              key: 'channel_advertising_revenue',
              name: 'Channel advertising revenue',
            },
            adCampaign: null,
            telegramAdSalePayment: { id: 'payment-1' },
          },
        ]),
      },
      telegramAdSalePaymentAllocation: {
        findMany: jest.fn().mockResolvedValue(allocations),
      },
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ primaryCurrency: 'UAH' }),
      },
    };
    const service = new TelegramChannelFinancialReadService(
      prisma as never,
      { convertCurrency: jest.fn(), getRate: jest.fn() } as never,
      {
        windowsForChannels: jest.fn().mockResolvedValue(
          new Map([
            [
              'channel-1',
              {
                h24: {
                  expectedViews: 124,
                  postsSampleCount: 3,
                  dataQuality: 'READY',
                },
                h48: {
                  expectedViews: 168,
                  postsSampleCount: 3,
                  dataQuality: 'READY',
                },
                h72: {
                  expectedViews: 178,
                  postsSampleCount: 3,
                  dataQuality: 'READY',
                },
                permanent: {
                  expectedViews: 244,
                  postsSampleCount: 3,
                  dataQuality: 'READY',
                },
              },
            ],
          ]),
        ),
      } as never,
    );

    const summaries = await service.buildChannelFinancialSummaryPreview(
      'workspace-1',
      [
        {
          id: 'channel-1',
          currentSubscribersCount: 7_719,
          ownViewsPerPost: 0,
          adBaseCpm: 300,
          adBaseCurrency: 'UAH',
          audienceSnapshots: [
            { activeSubscribersEstimate: 563, viewRate: 7.3 },
          ],
        },
      ],
    );

    const economics = summaries.get('channel-1')?.assetEconomics as {
      revenue: number;
      estimatedAdPrice: number;
      formatPricing: {
        h24: { estimatedPrice: number };
        permanent: { expectedViews: number; estimatedPrice: number };
      };
    };
    expect(economics.revenue).toBe(780);
    expect(economics.estimatedAdPrice).toBeCloseTo(73.2);
    expect(economics.formatPricing.h24.estimatedPrice).toBeCloseTo(37.2);
    expect(economics.formatPricing.permanent).toMatchObject({
      expectedViews: 244,
      estimatedPrice: 73.2,
    });
  });
});
