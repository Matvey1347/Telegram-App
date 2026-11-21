import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, TelegramAdPricingMode, TelegramAdSlotStrategy } from '@prisma/client';
import { createPaginatedResponse, normalizePagination } from '../../../common/pagination/pagination.utils';
import {
  CreateTelegramAdProductDto,
  RecommendTelegramAdPolicyDto,
  TelegramAdProductsQueryDto,
  UpdateTelegramAdChannelPricingDto,
  UpdateTelegramAdSalesMemberPreferencesDto,
  UpdateTelegramAdPolicyDto,
  UpdateTelegramAdProductDto,
} from './dto';
import { recommendPolicyFromOrganicPosts } from './domain/policy-recommendation';
import { decimal, decimalOrNull, decimalToString } from './domain/decimal';
import { pricingSettingsForChannel, pricingWindowSummary } from './telegram-ad-sales-pricing-reader';
import {
  loadAdSalesProductsForChannelsWithDefaults,
  materializeDefaultAdSalesProducts,
  normalizeDefaultAdSalesProductName,
  TELEGRAM_AD_SALES_DEFAULT_PRODUCTS,
} from './telegram-ad-sales-default-products';
import type { TelegramAdSalesOperations } from './telegram-ad-sales.service';

export function mapProduct(_operations: unknown, product: any) {
  return {
    ...product,
    defaultCpm: decimalToString(product.defaultCpm),
    defaultFixedPrice: decimalToString(product.defaultFixedPrice),
    minimumPrice: decimalToString(product.minimumPrice),
    estimatedPrice: decimalToString(product.estimatedPrice),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

export function mapPolicy(_operations: unknown, policy: any) {
  return {
    ...policy,
    expectedOrganicPostsPerDay: decimalToString(policy.expectedOrganicPostsPerDay),
    createdAt: policy.createdAt.toISOString(),
    updatedAt: policy.updatedAt.toISOString(),
  };
}

export function mapSnapshot(_operations: unknown, snapshot: any) {
  return {
    ...snapshot,
    averageViews: decimalToString(snapshot.averageViews),
    medianViews: decimalToString(snapshot.medianViews),
    adjustedViews: decimalToString(snapshot.adjustedViews),
    targetCpm: decimalToString(snapshot.targetCpm),
    minimumCpm: decimalToString(snapshot.minimumCpm),
    recommendedPrice: decimalToString(snapshot.recommendedPrice),
    minimumPrice: decimalToString(snapshot.minimumPrice),
    calculatedAt: snapshot.calculatedAt.toISOString(),
    createdAt: snapshot.createdAt.toISOString(),
  };
}

export function policyDefaults(_operations: unknown, timezone: string) {
  return {
    timezone,
    autoFrequencyEnabled: true,
    expectedOrganicPostsPerDay: null,
    useWorkspaceDefault: true,
    organicPostsPerAdSlot: 3,
    maxAdsPerDay: 999,
    minHoursBetweenAds: 0,
    minDaysBetweenAds: 0,
    slotStrategy: TelegramAdSlotStrategy.BEFORE_ORGANIC_POST,
    fallbackSlotTimes: [],
    allowManualSlots: false,
  };
}

export function mapAdSalesMemberPreferences(_operations: unknown, preferences: any) {
  return {
    ...preferences,
    createdAt: preferences.createdAt.toISOString(),
    updatedAt: preferences.updatedAt.toISOString(),
  };
}

export async function resolveWorkspaceTimezone(
  operations: Pick<TelegramAdSalesOperations, 'prisma'>,
  workspaceId: string,
) {
  const workspace = await operations.prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { timezone: true },
  });
  return workspace.timezone || 'Europe/Warsaw';
}

export async function resolvePolicy(
  operations: Pick<TelegramAdSalesOperations, 'policyDefaults' | 'prisma'>,
  workspaceId: string,
  channelId: string,
  timezone = 'UTC',
) {
  const policy = await operations.prisma.telegramAdSchedulePolicy.findFirst({
    where: { workspaceId, telegramChannelId: channelId },
  });
  if (policy) {
    return policy.useWorkspaceDefault
      ? {
          ...policy,
          organicPostsPerAdSlot: 3,
        }
      : policy;
  }
  return {
    id: 'virtual',
    workspaceId,
    telegramChannelId: channelId,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...operations.policyDefaults(timezone),
    organicPostsPerAdSlot: 3,
  };
}

export async function getChannelBaseline(
  operations: Pick<TelegramAdSalesOperations, 'findWorkspaceChannel' | 'pricingReader' | 'workspace'>,
  userId: string,
  channelId: string,
) {
  const workspaceId = await operations.workspace(userId);
  const channel = await operations.findWorkspaceChannel(workspaceId, channelId);
  const sources = await operations.pricingReader.sourcesForChannels(workspaceId, [channel]);
  const source = sources.get(channelId)!;
  const baseline = operations.pricingReader.expectedViews(source, null);
  const h24 = operations.pricingReader.expectedViews(source, 24);
  const h48 = operations.pricingReader.expectedViews(source, 48);
  const h72 = operations.pricingReader.expectedViews(source, 72);
  const d7 = operations.pricingReader.expectedViews(source, 168);
  return {
    channelId,
    expectedViews: baseline.expectedViews,
    averageViews: baseline.averageViews,
    medianViews: baseline.medianViews,
    adjustedViews: baseline.adjustedViews,
    postsSampleCount: baseline.postsSampleCount,
    methodVersion: baseline.methodVersion,
    dataQuality: baseline.dataQuality,
    warnings: baseline.warnings,
    fallbackSource: baseline.fallbackSource,
    sample: baseline.sample.map((item) => ({
      ...item,
      date: item.date.toISOString(),
    })),
    pricing: pricingSettingsForChannel(channel),
    windows: {
      final: pricingWindowSummary(baseline),
      h24: pricingWindowSummary(h24),
      h48: pricingWindowSummary(h48),
      h72: pricingWindowSummary(h72),
      d7: pricingWindowSummary(d7),
    },
  };
}

export async function getChannelSetup(
  operations: Pick<TelegramAdSalesOperations, 'getChannelBaseline' | 'getPolicy' | 'listChannelProducts'>,
  userId: string,
  channelId: string,
) {
  const [baseline, policy, products] = await Promise.all([
    operations.getChannelBaseline(userId, channelId),
    operations.getPolicy(userId, channelId),
    operations.listChannelProducts(userId, channelId),
  ]);
  return { baseline, policy, products };
}

export async function updateChannelPricing(
  operations: Pick<
    TelegramAdSalesOperations,
    'findWorkspaceChannel' | 'invalidateAvailabilityCache' | 'prisma' | 'workspace'
  >,
  userId: string,
  channelId: string,
  dto: UpdateTelegramAdChannelPricingDto,
) {
  const workspaceId = await operations.workspace(userId);
  await operations.findWorkspaceChannel(workspaceId, channelId);
  const channel = await operations.prisma.$transaction(async (tx) => {
    const updated = await tx.telegramChannel.update({
      where: { id: channelId },
      data: {
        ...(dto.baseCpm === undefined ? {} : { adBaseCpm: decimalOrNull(dto.baseCpm) }),
        ...(dto.currency === undefined ? {} : { adBaseCurrency: dto.currency.toUpperCase() }),
      },
      select: {
        id: true,
        adBaseCpm: true,
        adBaseCurrency: true,
        updatedAt: true,
      },
    });
    if (dto.currency !== undefined) {
      await tx.telegramAdProduct.updateMany({
        where: {
          workspaceId,
          telegramChannelId: channelId,
          defaultPricingMode: TelegramAdPricingMode.CPM,
        },
        data: { currency: dto.currency.toUpperCase() },
      });
    }
    return updated;
  });
  operations.invalidateAvailabilityCache(workspaceId);
  return pricingSettingsForChannel(channel);
}

export async function listProducts(
  operations: Pick<TelegramAdSalesOperations, 'mapProduct' | 'prisma' | 'workspace'>,
  userId: string,
  query: TelegramAdProductsQueryDto,
) {
  const workspaceId = await operations.workspace(userId);
  const pagination = normalizePagination(query);
  const where: Prisma.TelegramAdProductWhereInput = {
    workspaceId,
    ...(query.telegramChannelId ? { telegramChannelId: query.telegramChannelId } : {}),
    ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
  };
  const [items, totalItems] = await operations.prisma.$transaction([
    operations.prisma.telegramAdProduct.findMany({
      where,
      orderBy: [{ telegramChannelId: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }],
      skip: pagination.skip,
      take: pagination.take,
    }),
    operations.prisma.telegramAdProduct.count({ where }),
  ]);
  return createPaginatedResponse(
    items.map((item) => operations.mapProduct(item)),
    totalItems,
    pagination,
  );
}

export async function listChannelProducts(
  operations: Pick<
    TelegramAdSalesOperations,
    'findWorkspaceChannel' | 'mapProduct' | 'pricingReader' | 'prisma' | 'workspace'
  >,
  userId: string,
  channelId: string,
) {
  const workspaceId = await operations.workspace(userId);
  const channel = await operations.findWorkspaceChannel(workspaceId, channelId);
  await materializeDefaultAdSalesProducts(operations.prisma, {
    workspaceId,
    channelId,
    currency: channel.adBaseCurrency || 'USD',
  });
  const products = await operations.prisma.telegramAdProduct.findMany({
    where: { workspaceId, telegramChannelId: channelId },
    orderBy: [{ isActive: 'desc' }, { position: 'asc' }, { createdAt: 'asc' }],
  });
  const sources = await operations.pricingReader.sourcesForChannels(workspaceId, [channel]);
  const source = sources.get(channel.id)!;
  return products.map((product) => {
    const preview = operations.pricingReader.previewFromSource(source, product);
    return operations.mapProduct({
      ...product,
      pricingWindowHours: preview.pricingWindowHours,
      pricingWindowLabel: preview.pricingWindowLabel,
      estimatedViews: preview.expectedViews,
      estimatedPrice: decimal(preview.recommendedPrice),
    });
  });
}

export async function listProductsByChannels(
  operations: Pick<TelegramAdSalesOperations, 'mapProduct' | 'pricingReader' | 'prisma' | 'workspace'>,
  userId: string,
  requestedChannelIds: string[],
) {
  const workspaceId = await operations.workspace(userId);
  const channelIds = [...new Set(requestedChannelIds)];
  if (!channelIds.length) return {};
  const channels = await operations.prisma.telegramChannel.findMany({
    where: { workspaceId, id: { in: channelIds } },
  });
  if (channels.length !== channelIds.length) {
    throw new NotFoundException('One or more Telegram channels were not found');
  }
  const products = await loadAdSalesProductsForChannelsWithDefaults(operations.prisma, {
    workspaceId,
    channels,
  });
  const channelsById = new Map(channels.map((channel) => [channel.id, channel]));
  const pricingSources = await operations.pricingReader.sourcesForChannels(workspaceId, channels);
  const mappedProducts = products.map((product) => {
    const channel = channelsById.get(product.telegramChannelId)!;
    const preview = operations.pricingReader.previewFromSource(pricingSources.get(channel.id)!, product);
    return operations.mapProduct({
      ...product,
      pricingWindowHours: preview.pricingWindowHours,
      pricingWindowLabel: preview.pricingWindowLabel,
      estimatedViews: preview.expectedViews,
      estimatedPrice: decimal(preview.recommendedPrice),
    });
  });
  return Object.fromEntries(
    channelIds.map((channelId) => [
      channelId,
      mappedProducts.filter((product) => product.telegramChannelId === channelId),
    ]),
  );
}

export async function createProduct(
  operations: Pick<
    TelegramAdSalesOperations,
    'findWorkspaceChannel' | 'invalidateAvailabilityCache' | 'mapProduct' | 'prisma' | 'workspace'
  >,
  userId: string,
  channelId: string,
  dto: CreateTelegramAdProductDto,
) {
  const workspaceId = await operations.workspace(userId);
  await operations.findWorkspaceChannel(workspaceId, channelId);
  const product = await operations.prisma.telegramAdProduct.create({
    data: {
      workspaceId,
      telegramChannelId: channelId,
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      topDurationMinutes: dto.topDurationMinutes ?? null,
      feedDurationHours: dto.feedDurationHours ?? null,
      deleteAfterHours: dto.deleteAfterHours ?? null,
      isPermanent: dto.isPermanent ?? false,
      defaultPricingMode: dto.defaultPricingMode,
      defaultCpm: decimalOrNull(dto.defaultCpm),
      defaultFixedPrice: decimalOrNull(dto.defaultFixedPrice),
      minimumPrice: decimalOrNull(dto.minimumPrice),
      currency: dto.currency,
      isActive: dto.isActive ?? true,
      position: dto.position ?? 0,
    },
  });
  operations.invalidateAvailabilityCache(workspaceId);
  return operations.mapProduct(product);
}

export async function updateProduct(
  operations: Pick<
    TelegramAdSalesOperations,
    'invalidateAvailabilityCache' | 'mapProduct' | 'prisma' | 'workspace'
  >,
  userId: string,
  id: string,
  dto: UpdateTelegramAdProductDto,
) {
  const workspaceId = await operations.workspace(userId);
  const existing = await operations.prisma.telegramAdProduct.findFirst({
    where: { id, workspaceId },
  });
  if (!existing) throw new NotFoundException('Telegram ad product not found');
  const product = await operations.prisma.telegramAdProduct.update({
    where: { id },
    data: {
      ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
      ...(dto.description === undefined ? {} : { description: dto.description?.trim() || null }),
      ...(dto.topDurationMinutes === undefined ? {} : { topDurationMinutes: dto.topDurationMinutes }),
      ...(dto.feedDurationHours === undefined ? {} : { feedDurationHours: dto.feedDurationHours }),
      ...(dto.deleteAfterHours === undefined ? {} : { deleteAfterHours: dto.deleteAfterHours }),
      ...(dto.isPermanent === undefined ? {} : { isPermanent: dto.isPermanent }),
      ...(dto.defaultPricingMode === undefined ? {} : { defaultPricingMode: dto.defaultPricingMode }),
      ...(dto.defaultCpm === undefined ? {} : { defaultCpm: decimalOrNull(dto.defaultCpm) }),
      ...(dto.defaultFixedPrice === undefined
        ? {}
        : { defaultFixedPrice: decimalOrNull(dto.defaultFixedPrice) }),
      ...(dto.minimumPrice === undefined ? {} : { minimumPrice: decimalOrNull(dto.minimumPrice) }),
      ...(dto.currency === undefined ? {} : { currency: dto.currency }),
      ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
      ...(dto.position === undefined ? {} : { position: dto.position }),
    },
  });
  operations.invalidateAvailabilityCache(workspaceId);
  return operations.mapProduct(product);
}

export async function deactivateProduct(
  operations: Pick<TelegramAdSalesOperations, 'invalidateAvailabilityCache' | 'prisma' | 'workspace'>,
  userId: string,
  id: string,
) {
  const workspaceId = await operations.workspace(userId);
  const existing = await operations.prisma.telegramAdProduct.findFirst({
    where: { id, workspaceId },
  });
  if (!existing) throw new NotFoundException('Telegram ad product not found');
  const normalizedName = normalizeDefaultAdSalesProductName(existing.name);
  const isDefaultFormat = TELEGRAM_AD_SALES_DEFAULT_PRODUCTS.some(
    (template) => normalizeDefaultAdSalesProductName(template.name) === normalizedName,
  );
  if (isDefaultFormat) {
    throw new BadRequestException('Default placement formats cannot be removed');
  }
  await operations.prisma.telegramAdProduct.delete({
    where: { id },
  });
  operations.invalidateAvailabilityCache(workspaceId);
  return { success: true };
}

export async function getAdSalesMemberPreferences(
  operations: Pick<TelegramAdSalesOperations, 'mapAdSalesMemberPreferences' | 'prisma' | 'workspaceService'>,
  userId: string,
) {
  const membership = await operations.workspaceService.resolveWorkspaceMembershipForUser(userId);
  const existing = await operations.prisma.telegramAdSalesMemberPreferences.findUnique({
    where: { workspaceMemberId: membership.id },
  });
  if (existing) return operations.mapAdSalesMemberPreferences(existing);
  const preferences = await operations.prisma.telegramAdSalesMemberPreferences.create({
    data: {
      workspaceId: membership.workspaceId,
      workspaceMemberId: membership.id,
      selectedChannelIds: [],
      selectedNetworkId: null,
      calendarView: 'week',
      initialized: false,
    },
  });
  return operations.mapAdSalesMemberPreferences(preferences);
}

export async function updateAdSalesMemberPreferences(
  operations: Pick<
    TelegramAdSalesOperations,
    'findWorkspaceNetwork' | 'mapAdSalesMemberPreferences' | 'prisma' | 'workspaceService'
  >,
  userId: string,
  dto: UpdateTelegramAdSalesMemberPreferencesDto,
) {
  const membership = await operations.workspaceService.resolveWorkspaceMembershipForUser(userId);
  const update: Prisma.TelegramAdSalesMemberPreferencesUpdateInput = {};
  const create: Prisma.TelegramAdSalesMemberPreferencesCreateInput = {
    workspace: { connect: { id: membership.workspaceId } },
    workspaceMember: { connect: { id: membership.id } },
    selectedChannelIds: [],
    selectedNetworkId: null,
    calendarView: 'week',
    initialized: false,
  };
  if (dto.selectedChannelIds !== undefined) {
    const uniqueIds = Array.from(new Set(dto.selectedChannelIds));
    if (uniqueIds.length) {
      const count = await operations.prisma.telegramChannel.count({
        where: { workspaceId: membership.workspaceId, id: { in: uniqueIds } },
      });
      if (count !== uniqueIds.length) {
        throw new BadRequestException('Some selected channels do not belong to workspace');
      }
    }
    update.selectedChannelIds = uniqueIds;
    create.selectedChannelIds = uniqueIds;
  }
  if (dto.selectedNetworkId !== undefined) {
    if (dto.selectedNetworkId) {
      await operations.findWorkspaceNetwork(membership.workspaceId, dto.selectedNetworkId);
    }
    update.selectedNetworkId = dto.selectedNetworkId;
    create.selectedNetworkId = dto.selectedNetworkId;
  }
  if (dto.calendarView !== undefined) {
    update.calendarView = dto.calendarView;
    create.calendarView = dto.calendarView;
  }
  if (dto.initialized !== undefined) {
    update.initialized = dto.initialized;
    create.initialized = dto.initialized;
  }
  const preferences = await operations.prisma.telegramAdSalesMemberPreferences.upsert({
    where: { workspaceMemberId: membership.id },
    create,
    update,
  });
  return operations.mapAdSalesMemberPreferences(preferences);
}

export async function getPolicy(
  operations: Pick<
    TelegramAdSalesOperations,
    'findWorkspaceChannel' | 'mapPolicy' | 'resolvePolicy' | 'resolveWorkspaceTimezone' | 'workspace'
  >,
  userId: string,
  channelId: string,
) {
  const workspaceId = await operations.workspace(userId);
  await operations.findWorkspaceChannel(workspaceId, channelId);
  const workspaceTimezone = await operations.resolveWorkspaceTimezone(workspaceId);
  return operations.mapPolicy(await operations.resolvePolicy(workspaceId, channelId, workspaceTimezone));
}

export async function upsertPolicy(
  operations: Pick<
    TelegramAdSalesOperations,
    | 'findWorkspaceChannel'
    | 'invalidateAvailabilityCache'
    | 'mapPolicy'
    | 'policyDefaults'
    | 'prisma'
    | 'resolvePolicy'
    | 'resolveWorkspaceTimezone'
    | 'workspace'
  >,
  userId: string,
  channelId: string,
  dto: UpdateTelegramAdPolicyDto,
) {
  const workspaceId = await operations.workspace(userId);
  await operations.findWorkspaceChannel(workspaceId, channelId);
  const workspaceTimezone = await operations.resolveWorkspaceTimezone(workspaceId);
  const defaults = operations.policyDefaults(workspaceTimezone);
  const useWorkspaceDefault = dto.useWorkspaceDefault ?? false;
  const organicPostsPerAdSlot = dto.organicPostsPerAdSlot ?? defaults.organicPostsPerAdSlot;
  const policy = await operations.prisma.telegramAdSchedulePolicy.upsert({
    where: { telegramChannelId: channelId },
    create: {
      workspaceId,
      telegramChannelId: channelId,
      timezone: dto.timezone ?? workspaceTimezone,
      autoFrequencyEnabled: dto.autoFrequencyEnabled ?? true,
      expectedOrganicPostsPerDay: decimalOrNull(dto.expectedOrganicPostsPerDay),
      useWorkspaceDefault,
      organicPostsPerAdSlot,
      maxAdsPerDay: dto.maxAdsPerDay ?? defaults.maxAdsPerDay,
      minHoursBetweenAds: dto.minHoursBetweenAds ?? defaults.minHoursBetweenAds,
      minDaysBetweenAds: dto.minDaysBetweenAds ?? defaults.minDaysBetweenAds,
      slotStrategy: dto.slotStrategy ?? defaults.slotStrategy,
      fallbackSlotTimes: dto.fallbackSlotTimes ?? [],
      allowManualSlots: dto.allowManualSlots ?? false,
    },
    update: {
      timezone: dto.timezone ?? workspaceTimezone,
      ...(dto.autoFrequencyEnabled === undefined ? {} : { autoFrequencyEnabled: dto.autoFrequencyEnabled }),
      ...(dto.expectedOrganicPostsPerDay === undefined
        ? {}
        : {
            expectedOrganicPostsPerDay: decimalOrNull(dto.expectedOrganicPostsPerDay),
          }),
      ...(dto.useWorkspaceDefault === undefined ? {} : { useWorkspaceDefault }),
      ...(dto.organicPostsPerAdSlot === undefined ? {} : { organicPostsPerAdSlot }),
      ...(dto.maxAdsPerDay === undefined ? {} : { maxAdsPerDay: dto.maxAdsPerDay }),
      ...(dto.minHoursBetweenAds === undefined ? {} : { minHoursBetweenAds: dto.minHoursBetweenAds }),
      ...(dto.minDaysBetweenAds === undefined ? {} : { minDaysBetweenAds: dto.minDaysBetweenAds }),
      ...(dto.slotStrategy === undefined ? {} : { slotStrategy: dto.slotStrategy }),
      ...(dto.fallbackSlotTimes === undefined ? {} : { fallbackSlotTimes: dto.fallbackSlotTimes }),
      ...(dto.allowManualSlots === undefined ? {} : { allowManualSlots: dto.allowManualSlots }),
    },
  });
  operations.invalidateAvailabilityCache(workspaceId);
  return operations.mapPolicy(await operations.resolvePolicy(workspaceId, channelId, workspaceTimezone));
}

export async function recommendPolicy(
  operations: Pick<TelegramAdSalesOperations, 'findWorkspaceChannel' | 'prisma' | 'workspace'>,
  userId: string,
  channelId: string,
  dto: RecommendTelegramAdPolicyDto,
) {
  const workspaceId = await operations.workspace(userId);
  await operations.findWorkspaceChannel(workspaceId, channelId);
  const statisticsWindowDays = dto.statisticsWindowDays ?? 30;
  const from = new Date(Date.now() - statisticsWindowDays * 24 * 60 * 60 * 1000);
  const organicPosts = await operations.prisma.telegramPost.count({
    where: {
      workspaceId,
      telegramChannelId: channelId,
      postDate: { gte: from },
    },
  });
  const expectedOrganicPostsPerDay = organicPosts / statisticsWindowDays;
  return recommendPolicyFromOrganicPosts(expectedOrganicPostsPerDay);
}
