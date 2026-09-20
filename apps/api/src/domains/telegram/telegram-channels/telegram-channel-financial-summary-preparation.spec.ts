import { prepareTelegramChannelFinancialSummaries } from './telegram-channel-financial-summary-preparation';

describe('prepareTelegramChannelFinancialSummaries', () => {
  it('uses the channel CPM currency when purchase transactions use another currency', async () => {
    const prepared = prepareTelegramChannelFinancialSummaries({
      channels: [
        {
          id: 'channel-1',
          purchaseTransactionId: 'purchase-1',
          currentSubscribersCount: 8_976,
          adBaseCpm: 100,
          adBaseCurrency: 'UAH',
          kpiCurrency: 'UAH',
          audienceSnapshots: [],
        },
      ],
      campaigns: [],
      inviteLinks: [],
      transactions: [
        {
          id: 'purchase-1',
          telegramChannelId: null,
          type: 'expense',
          amount: 2_300,
          currency: 'PLN',
          amountInPrimaryCurrency: 575,
          categoryRef: { key: 'buy_channels', name: 'Buy Channels' },
          adCampaign: null,
          telegramAdSalePayment: null,
        },
      ],
      adSaleAllocations: [],
      primaryCurrency: 'USD',
      pricingWindowsByChannel: new Map(),
      rateSource: {
        getRate: jest.fn(async (from: string, to: string) => {
          if (from === 'PLN' && to === 'UAH') return 10;
          if (from === 'USD' && to === 'UAH') return 40;
          return null;
        }),
      },
    });

    const summary = (await prepared.build(preparedChannels())).get('channel-1');

    expect(summary?.assetEconomics).toMatchObject({
      currency: 'UAH',
      purchasePrice: 23_000,
      invested: 23_000,
    });
  });
});

function preparedChannels() {
  return [
    {
      id: 'channel-1',
      purchaseTransactionId: 'purchase-1',
      currentSubscribersCount: 8_976,
      adBaseCpm: 100,
      adBaseCurrency: 'UAH',
      kpiCurrency: 'UAH',
      audienceSnapshots: [],
    },
  ];
}
