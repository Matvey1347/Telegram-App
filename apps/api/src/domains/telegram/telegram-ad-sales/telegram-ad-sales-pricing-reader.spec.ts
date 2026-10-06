import { TelegramAdPricingMode } from '@prisma/client';
import { TelegramAdSalesPricingReader } from './telegram-ad-sales-pricing-reader';

describe('TelegramAdSalesPricingReader', () => {
  it('uses the selected format currency instead of a legacy channel fallback', () => {
    const reader = new TelegramAdSalesPricingReader({} as never);

    const preview = reader.previewFromSource(
      {
        channel: {
          id: 'channel-1',
          adBaseCpm: 100 as never,
          adBaseCurrency: 'USD',
        },
        posts: [],
      },
      {
        id: 'format-1',
        currency: 'UAH',
        defaultPricingMode: TelegramAdPricingMode.FIXED,
        defaultFixedPrice: 265.5 as never,
      },
    );

    expect(preview.currency).toBe('UAH');
  });

  it('uses the channel base currency for CPM even when a legacy product says otherwise', () => {
    const reader = new TelegramAdSalesPricingReader({} as never);

    const preview = reader.previewFromSource(
      {
        channel: {
          id: 'channel-1',
          adBaseCpm: 100 as never,
          adBaseCurrency: 'UAH',
        },
        posts: [],
      },
      {
        id: 'format-1',
        // Existing product rows can retain this stale value from before a
        // channel's CPM currency was configured.
        currency: 'USD',
        defaultPricingMode: TelegramAdPricingMode.CPM,
        defaultCpm: 100 as never,
      },
    );

    expect(preview.currency).toBe('UAH');
  });
});
