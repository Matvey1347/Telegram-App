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

@Injectable()
export class TelegramAdSalesQuotePreviewService {
  private readonly pricingReader: TelegramAdSalesPricingReader;

  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
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
      const isHistorical = context.scheduledAt && context.scheduledAt <= now;
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

    const results = new Map<number, TelegramAdQuotePreviewResult>();
    for (const context of contexts) {
      if (errors.has(context.index)) continue;
      const key =
        context.scheduledAt && context.scheduledAt <= now
          ? historicalSourceKey(context.scheduledAt)
          : CURRENT_SOURCE_KEY;
      const source = groupedSources.get(key)!.get(context.channel.id)!;
      const preview = this.preview(context, source);
      results.set(context.index, {
        requestId: context.request.requestId,
        quote: this.toQuote(context.request, preview),
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

  private toQuote(
    request: TelegramAdQuotePreviewRequestDto,
    preview: ReturnType<TelegramAdSalesPricingReader['previewFromSource']>,
  ): TelegramAdPriceQuote {
    return {
      snapshotId: null,
      expectedViews: preview.expectedViews,
      targetCpm: preview.targetCpm,
      recommendedPrice: preview.recommendedPrice,
      minimumPrice: preview.minimumPrice,
      currency: request.currency ?? preview.currency,
      dataQuality: preview.dataQuality,
      warnings: preview.warnings.map((code) => ({
        code: code as TelegramAdWarningCode,
        message: code,
      })),
    };
  }
}
