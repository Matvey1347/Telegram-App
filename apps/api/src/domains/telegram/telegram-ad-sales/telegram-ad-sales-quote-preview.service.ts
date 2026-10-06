import { Injectable } from '@nestjs/common';
import type {
  TelegramAdPriceQuote,
  TelegramAdQuotePreviewBatchResponse,
  TelegramAdQuotePreviewResult,
  TelegramAdWarningCode,
} from '@telegram-system/shared';
import { TELEGRAM_AD_QUOTE_PREVIEW_MAX_HISTORICAL_CUTOFFS } from '@telegram-system/shared';
import { TelegramAdPricingMode } from '@prisma/client';
import { runBounded } from '../../../common/run-bounded';
import {
  CurrencyConversionService,
  type PreparedCurrencyRateSource,
} from '../../../common/currency-conversion.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  AdSalesPricingChannel,
  AdSalesPricingProduct,
  AdSalesPricingSource,
  TelegramAdSalesPricingReader,
} from './telegram-ad-sales-pricing-reader';
import {
  TelegramAdQuotePreviewBatchRequestDto,
  TelegramAdQuotePreviewRequestDto,
} from './telegram-ad-sales-quote-preview.dto';
import { decimal, decimalToString } from './domain/decimal';

type PreviewContext = {
  index: number;
  request: TelegramAdQuotePreviewRequestDto;
  channel: AdSalesPricingChannel;
  product: AdSalesPricingProduct | null;
  scheduledAt: Date | null;
};

type PreviewProduct = AdSalesPricingProduct & {
  id: string;
  telegramChannelId: string;
};

const CURRENT_SOURCE_KEY = 'CURRENT';

const historicalSourceKey = (scheduledAt: Date) => scheduledAt.toISOString();

function isHistoricalQuoteDate(scheduledAt: Date, now: Date) {
  // A draft scheduled earlier today has not acquired historical placement
  // metrics. Use the same current view snapshot that powers the channel card,
  // rather than falling back to the full subscriber count.
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  return scheduledAt < todayStart;
}

@Injectable()
export class TelegramAdSalesQuotePreviewService {
  private readonly pricingReader: TelegramAdSalesPricingReader;

  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly currencyConversionService: CurrencyConversionService,
  ) {
    this.pricingReader = new TelegramAdSalesPricingReader(prisma);
  }

  async previewBatch(
    userId: string,
    dto: TelegramAdQuotePreviewBatchRequestDto,
  ): Promise<TelegramAdQuotePreviewBatchResponse> {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const channelIds = [
      ...new Set(dto.requests.map((request) => request.telegramChannelId)),
    ];
    const productIds = [
      ...new Set(
        dto.requests.flatMap((request) =>
          request.telegramAdProductId ? [request.telegramAdProductId] : [],
        ),
      ),
    ];
    const channelsPromise = this.prisma.telegramChannel.findMany({
      where: { workspaceId, id: { in: channelIds } },
      select: {
        id: true,
        currentSubscribersCount: true,
        ownViewsPerPost: true,
        adBaseCpm: true,
        adBaseCurrency: true,
        updatedAt: true,
      },
    });
    const productsPromise = productIds.length
      ? (this.prisma.telegramAdProduct.findMany({
          where: { workspaceId, id: { in: productIds } },
          select: {
            id: true,
            telegramChannelId: true,
            deleteAfterHours: true,
            isPermanent: true,
            defaultPricingMode: true,
            defaultCpm: true,
            defaultFixedPrice: true,
            currency: true,
          },
        }) as unknown as Promise<PreviewProduct[]>)
      : Promise.resolve([] as PreviewProduct[]);
    const [channels, products] = await Promise.all([
      channelsPromise,
      productsPromise,
    ]);
    const channelsById = new Map(
      channels.map((channel) => [channel.id, channel] as const),
    );
    const productsById = new Map(
      products.map((product) => [product.id, product] as const),
    );
    const errors = new Map<number, TelegramAdQuotePreviewResult>();
    const contexts = dto.requests.flatMap<PreviewContext>((request, index) => {
      const channel = channelsById.get(request.telegramChannelId);
      if (!channel) {
        errors.set(index, {
          requestId: request.requestId,
          error: {
            code: 'CHANNEL_NOT_FOUND',
            message: 'Telegram channel not found',
          },
        });
        return [];
      }
      const product = request.telegramAdProductId
        ? productsById.get(request.telegramAdProductId)
        : null;
      if (
        request.telegramAdProductId &&
        (!product || product.telegramChannelId !== request.telegramChannelId)
      ) {
        errors.set(index, {
          requestId: request.requestId,
          error: {
            code: 'PRODUCT_NOT_FOUND',
            message: 'Telegram ad product not found',
          },
        });
        return [];
      }
      return [
        {
          index,
          request,
          channel,
          product: product ?? null,
          scheduledAt: request.scheduledAt
            ? new Date(request.scheduledAt)
            : null,
        },
      ];
    });

    const now = new Date();
    const historicalCutoffs = new Set<string>();
    const groups = new Map<string, PreviewContext[]>();
    for (const context of contexts) {
      const isHistorical =
        context.scheduledAt && isHistoricalQuoteDate(context.scheduledAt, now);
      const key = isHistorical
        ? historicalSourceKey(context.scheduledAt!)
        : CURRENT_SOURCE_KEY;
      if (
        isHistorical &&
        !historicalCutoffs.has(key) &&
        historicalCutoffs.size >=
          TELEGRAM_AD_QUOTE_PREVIEW_MAX_HISTORICAL_CUTOFFS
      ) {
        errors.set(context.index, {
          requestId: context.request.requestId,
          error: {
            code: 'INVALID_REQUEST',
            message: `A quote batch supports at most ${TELEGRAM_AD_QUOTE_PREVIEW_MAX_HISTORICAL_CUTOFFS} distinct historical cutoffs`,
          },
        });
        continue;
      }
      if (isHistorical) historicalCutoffs.add(key);
      const group = groups.get(key);
      if (group) group.push(context);
      else groups.set(key, [context]);
    }
    const groupedSources = new Map<string, Map<string, AdSalesPricingSource>>();
    await runBounded([...groups.entries()], 4, async ([key, grouped]) => {
      groupedSources.set(
        key,
        await this.pricingReader.sourcesForChannels(
          workspaceId,
          [
            ...new Map(
              grouped.map((item) => [item.channel.id, item.channel]),
            ).values(),
          ],
          key === CURRENT_SOURCE_KEY ? undefined : grouped[0].scheduledAt!,
        ),
      );
    });

    const previews = contexts.flatMap((context) => {
      if (errors.has(context.index)) return [];
      const key =
        context.scheduledAt && isHistoricalQuoteDate(context.scheduledAt, now)
          ? historicalSourceKey(context.scheduledAt)
          : CURRENT_SOURCE_KEY;
      const source = groupedSources.get(key)!.get(context.channel.id)!;
      return [{ context, key, preview: this.preview(context, source) }];
    });
    const requiresConversion = ({
      context,
      preview,
    }: Pick<(typeof previews)[number], 'context' | 'preview'>) =>
      preview.currency.toUpperCase() !==
      (context.request.currency ?? preview.currency).toUpperCase();
    const historicalDates = previews
      .filter(
        ({ key, ...item }) =>
          key !== CURRENT_SOURCE_KEY && requiresConversion(item),
      )
      .map(({ context }) => context.scheduledAt!);
    const [currentRateSource, historicalRateSources] = await Promise.all([
      previews.some(
        ({ key, ...item }) =>
          key === CURRENT_SOURCE_KEY && requiresConversion(item),
      )
        ? this.currencyConversionService.prepareRateSource(workspaceId)
        : Promise.resolve<PreparedCurrencyRateSource | null>(null),
      this.currencyConversionService.prepareHistoricalRateSources(
        workspaceId,
        historicalDates,
      ),
    ]);

    const results = new Map<number, TelegramAdQuotePreviewResult>();
    for (const { context, key, preview } of previews) {
      const rateSource =
        key === CURRENT_SOURCE_KEY
          ? currentRateSource
          : historicalRateSources.get(context.scheduledAt!.toISOString());
      const quote = await this.toQuote(context.request, preview, rateSource);
      if (!quote) {
        errors.set(context.index, {
          requestId: context.request.requestId,
          error: {
            code: 'RATE_UNAVAILABLE',
            message: `No exchange rate from ${preview.currency} to ${context.request.currency}`,
          },
        });
        continue;
      }
      results.set(context.index, {
        requestId: context.request.requestId,
        quote,
      });
    }
    return {
      items: dto.requests.map(
        (request, index) =>
          errors.get(index) ??
          results.get(index) ?? {
            requestId: request.requestId,
            error: {
              code: 'INVALID_REQUEST',
              message: 'Unable to preview Telegram ad quote',
            },
          },
      ),
    };
  }

  private preview(context: PreviewContext, source: AdSalesPricingSource) {
    const pricingMode =
      context.request.pricingMode ??
      context.product?.defaultPricingMode ??
      TelegramAdPricingMode.CPM;
    const targetCpm =
      context.request.targetCpm ??
      context.channel.adBaseCpm ??
      context.product?.defaultCpm ??
      0;
    return this.pricingReader.previewFromSource(source, context.product, {
      pricingMode,
      targetCpm,
      minimumCpm: context.request.minimumCpm ?? targetCpm,
      fixedPrice:
        context.request.fixedPrice ?? context.product?.defaultFixedPrice ?? 0,
    });
  }

  private async toQuote(
    request: TelegramAdQuotePreviewRequestDto,
    preview: ReturnType<TelegramAdSalesPricingReader['previewFromSource']>,
    rateSource: PreparedCurrencyRateSource | null | undefined,
  ): Promise<TelegramAdPriceQuote | null> {
    const sourceCurrency = preview.currency.toUpperCase();
    const targetCurrency = (request.currency ?? sourceCurrency).toUpperCase();
    const rate =
      sourceCurrency === targetCurrency
        ? 1
        : await rateSource?.getRate(sourceCurrency, targetCurrency);
    if (rate == null) return null;
    return {
      snapshotId: null,
      expectedViews: preview.expectedViews,
      targetCpm: decimalToString(decimal(preview.targetCpm).mul(rate))!,
      recommendedPrice: decimalToString(
        decimal(preview.recommendedPrice).mul(rate),
      )!,
      minimumPrice: decimalToString(decimal(preview.minimumPrice).mul(rate))!,
      currency: targetCurrency,
      dataQuality: preview.dataQuality,
      warnings: preview.warnings.map((code) => ({
        code: code as TelegramAdWarningCode,
        message: code,
      })),
    };
  }
}
