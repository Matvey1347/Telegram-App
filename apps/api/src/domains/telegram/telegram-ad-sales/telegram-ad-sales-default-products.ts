import { TelegramAdPricingMode } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export const TELEGRAM_AD_SALES_DEFAULT_PRODUCTS = [
  {
    name: '1/24',
    topDurationMinutes: 60,
    feedDurationHours: 24,
    deleteAfterHours: 24,
    isPermanent: false,
    position: 0,
  },
  {
    name: '2/48',
    topDurationMinutes: 120,
    feedDurationHours: 48,
    deleteAfterHours: 48,
    isPermanent: false,
    position: 1,
  },
  {
    name: '3/72',
    topDurationMinutes: 180,
    feedDurationHours: 72,
    deleteAfterHours: 72,
    isPermanent: false,
    position: 2,
  },
  {
    name: 'No auto-delete',
    topDurationMinutes: 60,
    feedDurationHours: null,
    deleteAfterHours: null,
    isPermanent: true,
    position: 3,
  },
] as const;

export function normalizeDefaultAdSalesProductName(name: string) {
  const normalized = name.trim().toLowerCase();
  return normalized === '1/permanent' || normalized === 'no auto-delete'
    ? 'no auto-delete'
    : normalized;
}

type DefaultProductChannel = {
  id: string;
  adBaseCurrency?: string | null;
};

type ExistingProductName = {
  telegramChannelId: string;
  name: string;
};

/**
 * Materializes missing default formats for an already workspace-scoped channel
 * batch. Established reads perform no write; a first-use batch needs at most
 * one createMany regardless of channel count.
 */
export async function materializeDefaultAdSalesProductsForChannels(
  prisma: Pick<PrismaService, 'telegramAdProduct'>,
  params: {
    workspaceId: string;
    channels: DefaultProductChannel[];
    existingProducts?: ExistingProductName[];
  },
) {
  if (!params.channels.length) return false;
  const channelIds = params.channels.map((channel) => channel.id);
  const existing =
    params.existingProducts ??
    (await prisma.telegramAdProduct.findMany({
      where: {
        workspaceId: params.workspaceId,
        telegramChannelId: { in: channelIds },
      },
      select: { telegramChannelId: true, name: true },
    }));
  const existingNamesByChannel = new Map<string, Set<string>>();
  for (const product of existing) {
    if (!product.name) continue;
    const names =
      existingNamesByChannel.get(product.telegramChannelId) ?? new Set();
    names.add(normalizeDefaultAdSalesProductName(product.name));
    existingNamesByChannel.set(product.telegramChannelId, names);
  }
  const missing = params.channels.flatMap((channel) => {
    const existingNames = existingNamesByChannel.get(channel.id) ?? new Set();
    return TELEGRAM_AD_SALES_DEFAULT_PRODUCTS.filter(
      (template) =>
        !existingNames.has(normalizeDefaultAdSalesProductName(template.name)),
    ).map((template) => ({ channel, template }));
  });
  if (!missing.length) return false;
  await prisma.telegramAdProduct.createMany({
    skipDuplicates: true,
    data: missing.map(({ channel, template }) => ({
      workspaceId: params.workspaceId,
      telegramChannelId: channel.id,
      name: template.name,
      description: null,
      topDurationMinutes: template.topDurationMinutes,
      feedDurationHours: template.feedDurationHours,
      deleteAfterHours: template.deleteAfterHours,
      isPermanent: template.isPermanent,
      defaultPricingMode: TelegramAdPricingMode.CPM,
      defaultCpm: null,
      defaultFixedPrice: null,
      minimumPrice: null,
      currency: channel.adBaseCurrency || 'USD',
      isActive: true,
      position: template.position,
    })),
  });
  return true;
}

export async function loadAdSalesProductsForChannelsWithDefaults(
  prisma: Pick<PrismaService, 'telegramAdProduct'>,
  params: { workspaceId: string; channels: DefaultProductChannel[] },
) {
  const channelIds = params.channels.map((channel) => channel.id);
  const query = {
    where: {
      workspaceId: params.workspaceId,
      telegramChannelId: { in: channelIds },
    },
    orderBy: [
      { telegramChannelId: 'asc' as const },
      { isActive: 'desc' as const },
      { position: 'asc' as const },
      { createdAt: 'asc' as const },
    ],
  };
  let products = await prisma.telegramAdProduct.findMany(query);
  if (
    await materializeDefaultAdSalesProductsForChannels(prisma, {
      ...params,
      existingProducts: products,
    })
  ) {
    products = await prisma.telegramAdProduct.findMany(query);
  }
  return products;
}

export async function materializeDefaultAdSalesProducts(
  prisma: PrismaService,
  params: { workspaceId: string; channelId: string; currency: string },
) {
  return materializeDefaultAdSalesProductsForChannels(prisma, {
    workspaceId: params.workspaceId,
    channels: [{ id: params.channelId, adBaseCurrency: params.currency }],
  });
}
