import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TelegramAdPricingMode } from '@prisma/client';
import {
  TELEGRAM_AD_QUOTE_PREVIEW_MAX_HISTORICAL_CUTOFFS,
  TELEGRAM_AD_QUOTE_PREVIEW_MAX_REQUESTS,
} from '@telegram-system/shared';
import { TelegramAdSalesPricingReader } from './telegram-ad-sales-pricing-reader';
import { TelegramAdQuotePreviewBatchRequestDto } from './telegram-ad-sales-quote-preview.dto';
import { TelegramAdSalesQuotePreviewService } from './telegram-ad-sales-quote-preview.service';

describe('TelegramAdSalesQuotePreviewService', () => {
  function setup() {
    const prisma = {
      telegramChannel: { findMany: jest.fn() },
      telegramAdProduct: { findMany: jest.fn() },
      telegramAdPriceSnapshot: { create: jest.fn() },
    };
    const workspaceService = {
      resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('ws-1'),
    };
    const service = new TelegramAdSalesQuotePreviewService(
      prisma as never,
      workspaceService as never,
    );
    const pricingReader = (
      service as unknown as { pricingReader: TelegramAdSalesPricingReader }
    ).pricingReader;
    const sourcesForChannels = jest
      .spyOn(pricingReader, 'sourcesForChannels')
      .mockImplementation(
        (_workspaceId: string, channels: Array<{ id: string }>) =>
          Promise.resolve(
            new Map(
              channels.map((channel) => [
                channel.id,
                { channel, posts: [], evaluatedAt: new Date() },
              ]),
            ),
          ),
      );
    const previewFromSource = jest
      .spyOn(pricingReader, 'previewFromSource')
      .mockReturnValue({
        expectedViews: 1_000,
        averageViews: 1_000,
        medianViews: 1_000,
        adjustedViews: 1_000,
        postsSampleCount: 10,
        dataQuality: 'READY',
        warnings: [],
        fallbackSource: 'POSTS',
        methodVersion: 'v1',
        sample: [],
        pricingWindowHours: 24,
        pricingWindowLabel: '24 hours',
        currency: 'USD',
        recommendedPrice: '12',
        minimumPrice: '10',
        targetCpm: '12',
      });
    return {
      prisma,
      workspaceService,
      service,
      sourcesForChannels,
      previewFromSource,
    };
  }

  it('authorizes once, batches sources, preserves order, and returns per-item failures without writes', async () => {
    const {
      prisma,
      workspaceService,
      service,
      sourcesForChannels,
      previewFromSource,
    } = setup();
    prisma.telegramChannel.findMany.mockResolvedValue([
      {
        id: 'channel-1',
        currentSubscribersCount: 1_000,
        ownViewsPerPost: 500,
        adBaseCpm: null,
        adBaseCurrency: 'USD',
        updatedAt: new Date(),
      },
    ]);
    prisma.telegramAdProduct.findMany.mockResolvedValue([
      {
        id: 'product-wrong-channel',
        telegramChannelId: 'channel-2',
        deleteAfterHours: 24,
        isPermanent: false,
        defaultPricingMode: TelegramAdPricingMode.CPM,
        defaultCpm: null,
        defaultFixedPrice: null,
      },
    ]);

    const result = await service.previewBatch('user-1', {
      requests: [
        { requestId: 'ok-1', telegramChannelId: 'channel-1' },
        { requestId: 'missing', telegramChannelId: 'channel-missing' },
        {
          requestId: 'wrong-product',
          telegramChannelId: 'channel-1',
          telegramAdProductId: 'product-wrong-channel',
        },
        { requestId: 'ok-2', telegramChannelId: 'channel-1' },
      ],
    });

    expect(result.items[0]?.requestId).toBe('ok-1');
    expect(result.items[0]).toHaveProperty('quote.snapshotId', null);
    expect(result.items[1]).toEqual({
      requestId: 'missing',
      error: {
        code: 'CHANNEL_NOT_FOUND',
        message: 'Telegram channel not found',
      },
    });
    expect(result.items[2]).toEqual({
      requestId: 'wrong-product',
      error: {
        code: 'PRODUCT_NOT_FOUND',
        message: 'Telegram ad product not found',
      },
    });
    expect(result.items[3]?.requestId).toBe('ok-2');
    expect(result.items[3]).toHaveProperty('quote.snapshotId', null);
    expect(workspaceService.resolveWorkspaceIdForUser).toHaveBeenCalledTimes(1);
    expect(prisma.telegramChannel.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.telegramAdProduct.findMany).toHaveBeenCalledTimes(1);
    expect(sourcesForChannels).toHaveBeenCalledTimes(1);
    expect(previewFromSource).toHaveBeenCalledTimes(2);
    expect(prisma.telegramAdPriceSnapshot.create).not.toHaveBeenCalled();
  });

  it('accepts the 100-channel three-month surface at the DTO boundary', async () => {
    const dto = plainToInstance(TelegramAdQuotePreviewBatchRequestDto, {
      requests: Array.from({ length: 9_300 }, (_, index) => ({
        requestId: `request-${index}`,
        telegramChannelId: 'channel-1',
      })),
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it('rejects requests above the frozen quote batch maximum', async () => {
    const dto = plainToInstance(TelegramAdQuotePreviewBatchRequestDto, {
      requests: Array.from(
        { length: TELEGRAM_AD_QUOTE_PREVIEW_MAX_REQUESTS + 1 },
        (_, index) => ({
          requestId: `request-${index}`,
          telegramChannelId: 'channel-1',
        }),
      ),
    });

    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'requests' }),
      ]),
    );
  });

  it.each([1, 100, TELEGRAM_AD_QUOTE_PREVIEW_MAX_REQUESTS])(
    'uses one current pricing source read for %i future requests',
    async (requestCount) => {
      const { prisma, service, sourcesForChannels } = setup();
      prisma.telegramChannel.findMany.mockResolvedValue([
        {
          id: 'channel-1',
          currentSubscribersCount: 1_000,
          ownViewsPerPost: 500,
          adBaseCpm: null,
          adBaseCurrency: 'USD',
          updatedAt: new Date(),
        },
      ]);

      const result = await service.previewBatch('user-1', {
        requests: Array.from({ length: requestCount }, (_, index) => ({
          requestId: `future-${index}`,
          telegramChannelId: 'channel-1',
          scheduledAt: new Date(
            Date.UTC(2090, 0, 1 + (index % 93)),
          ).toISOString(),
        })),
      });

      expect(result.items).toHaveLength(requestCount);
      expect(sourcesForChannels).toHaveBeenCalledTimes(1);
      expect(sourcesForChannels).toHaveBeenCalledWith(
        'ws-1',
        expect.any(Array),
        undefined,
      );
      expect(prisma.telegramAdPriceSnapshot.create).not.toHaveBeenCalled();
    },
  );

  it('retains exact historical cutoffs up to the bound and returns ordered partial errors beyond it', async () => {
    const { prisma, service, sourcesForChannels } = setup();
    prisma.telegramChannel.findMany.mockResolvedValue([
      {
        id: 'channel-1',
        currentSubscribersCount: 1_000,
        ownViewsPerPost: 500,
        adBaseCpm: null,
        adBaseCurrency: 'USD',
        updatedAt: new Date(),
      },
    ]);
    const requests = Array.from(
      { length: TELEGRAM_AD_QUOTE_PREVIEW_MAX_HISTORICAL_CUTOFFS + 2 },
      (_, index) => ({
        requestId: `historical-${index}`,
        telegramChannelId: 'channel-1',
        scheduledAt: new Date(Date.UTC(2020, 0, 1 + index)).toISOString(),
      }),
    );
    requests.push({
      requestId: 'historical-repeat',
      telegramChannelId: 'channel-1',
      scheduledAt: requests[0].scheduledAt,
    });

    const result = await service.previewBatch('user-1', { requests });

    expect(sourcesForChannels).toHaveBeenCalledTimes(
      TELEGRAM_AD_QUOTE_PREVIEW_MAX_HISTORICAL_CUTOFFS,
    );
    expect(result.items.map((item) => item.requestId)).toEqual(
      requests.map((request) => request.requestId),
    );
    expect(
      result.items
        .slice(0, TELEGRAM_AD_QUOTE_PREVIEW_MAX_HISTORICAL_CUTOFFS)
        .every((item) => 'quote' in item),
    ).toBe(true);
    const rejected =
      result.items[TELEGRAM_AD_QUOTE_PREVIEW_MAX_HISTORICAL_CUTOFFS];
    expect(rejected.requestId).toBe(
      `historical-${TELEGRAM_AD_QUOTE_PREVIEW_MAX_HISTORICAL_CUTOFFS}`,
    );
    expect(rejected.error?.code).toBe('INVALID_REQUEST');
    expect(result.items.at(-1)?.requestId).toBe('historical-repeat');
    expect('quote' in result.items.at(-1)!).toBe(true);
    expect(prisma.telegramAdPriceSnapshot.create).not.toHaveBeenCalled();
  });
});
