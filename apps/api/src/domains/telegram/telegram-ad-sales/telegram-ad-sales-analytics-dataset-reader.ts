import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export type AdSalesAnalyticsDatasetParams = {
  workspaceId: string;
  from: Date;
  to: Date;
  channelIds?: string[];
  networkId?: string | null;
  networkMode?: 'SALE_CONTEXT' | 'CURRENT_CHANNELS';
};

export function adSalesAnalyticsPlacementWhere(
  params: AdSalesAnalyticsDatasetParams,
): Prisma.TelegramAdSalePlacementWhereInput {
  return {
    workspaceId: params.workspaceId,
    ...(params.networkId && params.networkMode !== 'CURRENT_CHANNELS'
      ? { telegramChannelNetworkId: params.networkId }
      : {}),
    ...(params.channelIds?.length
      ? { telegramChannelId: { in: params.channelIds } }
      : {}),
    OR: [
      { scheduledAt: { gte: params.from, lte: params.to } },
      { publishedAt: { gte: params.from, lte: params.to } },
      { sale: { createdAt: { gte: params.from, lte: params.to } } },
    ],
  };
}

export class TelegramAdSalesAnalyticsDatasetReader {
  constructor(private readonly prisma: PrismaService) {}

  async read(params: AdSalesAnalyticsDatasetParams) {
    const placements = await this.prisma.telegramAdSalePlacement.findMany({
      where: adSalesAnalyticsPlacementWhere(params),
      select: {
        id: true,
        workspaceId: true,
        telegramAdSaleId: true,
        telegramChannelId: true,
        telegramChannelNetworkId: true,
        telegramAdProductId: true,
        pricingSnapshotId: true,
        status: true,
        scheduledAt: true,
        timezone: true,
        expectedViews: true,
        recommendedPrice: true,
        minimumPrice: true,
        agreedPrice: true,
        currency: true,
        publishedAt: true,
        plannedDeleteAt: true,
        deletedAt: true,
        lastDeletionError: true,
        actualViews24h: true,
        actualViews48h: true,
        actualViewsFinal: true,
        actualReactionsFinal: true,
        actualCpm: true,
        createdAt: true,
        sale: {
          select: {
            id: true,
            advertiserName: true,
            status: true,
            createdAt: true,
            settlementCurrency: true,
          },
        },
        paymentAllocations: {
          select: {
            amount: true,
            amountInPrimaryCurrency: true,
            payment: {
              select: {
                status: true,
                paidAt: true,
                amount: true,
                amountInPrimaryCurrency: true,
                currency: true,
              },
            },
          },
        },
      },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
    });
    const channelIds = [
      ...new Set(placements.map((placement) => placement.telegramChannelId)),
    ];
    const channels = channelIds.length
      ? await this.prisma.telegramChannel.findMany({
          where: { workspaceId: params.workspaceId, id: { in: channelIds } },
          select: { id: true, title: true, username: true, photoUrl: true },
        })
      : [];
    return { placements, channels };
  }

  async sumAgreedRevenue(params: AdSalesAnalyticsDatasetParams) {
    const result = await this.prisma.telegramAdSalePlacement.aggregate({
      where: adSalesAnalyticsPlacementWhere(params),
      _sum: { agreedPrice: true },
    });
    return result._sum.agreedPrice ?? new Prisma.Decimal(0);
  }
}

export type AdSalesAnalyticsDataset = Awaited<
  ReturnType<TelegramAdSalesAnalyticsDatasetReader['read']>
>;
