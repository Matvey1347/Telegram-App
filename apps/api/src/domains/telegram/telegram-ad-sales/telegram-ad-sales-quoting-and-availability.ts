import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TelegramAdPricingMode } from '@prisma/client';
import {
  CreateTelegramAdQuoteDto,
  TelegramAdAvailabilityQueryDto,
  TelegramAdPriceHistoryQueryDto,
} from './dto';
import { decimal, decimalOrNull, decimalToString } from './domain/decimal';
import type { TelegramAdSalesOperations } from './telegram-ad-sales.service';

export async function createQuote(
  operations: Pick<
    TelegramAdSalesOperations,
    'findWorkspaceChannel' | 'logger' | 'pricingReader' | 'prisma' | 'workspace'
  >,
  userId: string,
  dto: CreateTelegramAdQuoteDto,
) {
  const workspaceId = await operations.workspace(userId);
  const channel = await operations.findWorkspaceChannel(workspaceId, dto.telegramChannelId);
  const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
  const product = dto.telegramAdProductId
    ? await operations.prisma.telegramAdProduct.findFirst({
        where: {
          id: dto.telegramAdProductId,
          workspaceId,
          telegramChannelId: dto.telegramChannelId,
        },
      })
    : null;
  if (dto.telegramAdProductId && !product) {
    throw new NotFoundException('Telegram ad product not found');
  }

  const pricingMode = dto.pricingMode ?? product?.defaultPricingMode ?? TelegramAdPricingMode.CPM;
  const quoteOverrides = {
    pricingMode,
    targetCpm: dto.targetCpm ?? channel.adBaseCpm ?? product?.defaultCpm ?? 0,
    minimumCpm: dto.minimumCpm ?? dto.targetCpm ?? channel.adBaseCpm ?? product?.defaultCpm ?? 0,
    fixedPrice: dto.fixedPrice ?? product?.defaultFixedPrice ?? 0,
    asOf: scheduledAt,
  };
  let preview = await operations.pricingReader.preview(workspaceId, channel, product, quoteOverrides);
  if (scheduledAt && scheduledAt > new Date() && preview.expectedViews == null) {
    preview = await operations.pricingReader.preview(workspaceId, channel, product, {
      ...quoteOverrides,
      asOf: null,
    });
  }
  if (preview.expectedViews == null) {
    return {
      snapshotId: null,
      expectedViews: null,
      targetCpm: preview.targetCpm,
      recommendedPrice: '0.00',
      minimumPrice: '0.00',
      currency: dto.currency ?? preview.currency,
      dataQuality: preview.dataQuality,
      warnings: preview.warnings.map((code) => ({
        code,
        message: code,
      })),
      sample: preview.sample.map((item) => ({
        ...item,
        date: item.date.toISOString(),
      })),
    };
  }

  const snapshot = await operations.prisma.telegramAdPriceSnapshot.create({
    data: {
      workspaceId,
      telegramChannelId: channel.id,
      telegramAdProductId: product?.id ?? null,
      source: dto.source ?? 'quote',
      methodVersion: preview.methodVersion,
      statisticsWindowDays: 30,
      postsSampleCount: preview.postsSampleCount,
      expectedViews: preview.expectedViews,
      averageViews: decimalOrNull(preview.averageViews),
      medianViews: decimalOrNull(preview.medianViews),
      adjustedViews: decimalOrNull(preview.adjustedViews),
      targetCpm: decimal(preview.targetCpm),
      minimumCpm: decimal(preview.targetCpm),
      recommendedPrice: decimal(preview.recommendedPrice),
      minimumPrice: decimal(preview.minimumPrice),
      currency: dto.currency ?? preview.currency,
      metadata: {
        dataQuality: preview.dataQuality,
        warnings: preview.warnings,
        fallbackSource: preview.fallbackSource,
        pricingWindowHours: preview.pricingWindowHours,
        pricingWindowLabel: preview.pricingWindowLabel,
        pricedAt: scheduledAt?.toISOString() ?? null,
      },
    },
  });

  operations.logger.info({
    event: 'telegram_ad_sales.quote_created',
    message: `Created price quote for channel ${channel.id}`,
    metadata: {
      channelId: channel.id,
      productId: product?.id ?? null,
      snapshotId: snapshot.id,
      pricedAt: scheduledAt?.toISOString() ?? null,
    },
  });

  return {
    snapshotId: snapshot.id,
    expectedViews: snapshot.expectedViews,
    targetCpm: decimalToString(snapshot.targetCpm),
    recommendedPrice: decimalToString(snapshot.recommendedPrice),
    minimumPrice: decimalToString(snapshot.minimumPrice),
    currency: snapshot.currency,
    dataQuality: preview.dataQuality,
    warnings: [...preview.warnings].map((code) => ({
      code,
      message: code,
    })),
  };
}

export async function priceHistory(
  operations: Pick<
    TelegramAdSalesOperations,
    'findWorkspaceChannel' | 'mapSnapshot' | 'prisma' | 'workspace'
  >,
  userId: string,
  channelId: string,
  query: TelegramAdPriceHistoryQueryDto,
) {
  const workspaceId = await operations.workspace(userId);
  await operations.findWorkspaceChannel(workspaceId, channelId);
  const history = await operations.prisma.telegramAdPriceSnapshot.findMany({
    where: {
      workspaceId,
      telegramChannelId: channelId,
      ...(query.telegramAdProductId ? { telegramAdProductId: query.telegramAdProductId } : {}),
    },
    orderBy: { calculatedAt: 'desc' },
    take: query.limit ?? 50,
  });
  return history.map((item) => operations.mapSnapshot(item));
}

export async function availability(
  operations: Pick<
    TelegramAdSalesOperations,
    'availabilityCacheKey' | 'availabilityReader' | 'findWorkspaceNetwork' | 'responseCache' | 'workspace'
  >,
  userId: string,
  dto: TelegramAdAvailabilityQueryDto,
) {
  const workspaceId = await operations.workspace(userId);
  const from = new Date(dto.from);
  const to = new Date(dto.to);
  const days = Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  if (days > 93) {
    throw new BadRequestException('Availability range cannot exceed 93 days');
  }
  if (!dto.channelIds?.length && !dto.networkId) {
    throw new BadRequestException('Provide channelIds or networkId');
  }
  let channelIds = dto.channelIds ?? [];
  if (dto.networkId) {
    const network = await operations.findWorkspaceNetwork(workspaceId, dto.networkId);
    channelIds = network.channels.map((item) => item.telegramChannelId);
  }
  if (channelIds.length > 50) {
    throw new BadRequestException('Availability request cannot exceed 50 channels');
  }
  const cacheKey = operations.availabilityCacheKey({
    workspaceId,
    channelIds,
    networkId: dto.networkId ?? null,
    productIds: dto.productIds,
    from: dto.from,
    to: dto.to,
    cacheBust: dto.cacheBust,
  });
  return operations.responseCache.getOrSet(cacheKey, 30_000, () =>
    operations.availabilityReader.read(workspaceId, dto, channelIds),
  );
}
