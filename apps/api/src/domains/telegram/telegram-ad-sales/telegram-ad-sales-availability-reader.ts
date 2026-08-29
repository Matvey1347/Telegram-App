import { BadRequestException } from '@nestjs/common';
import {
  Prisma,
  TelegramAdSalePaymentStatus,
  TelegramAdSlotStrategy,
  TelegramManagedPostStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ACTIVE_TELEGRAM_AD_PLACEMENT_STATUSES } from './telegram-ad-sales-reservation';
import { TelegramAdAvailabilityQueryDto } from './dto';
import {
  AvailabilityPolicy,
  buildAdSalesAvailability,
} from './telegram-ad-sales-availability-builder';
import { TelegramAdSalesPricingReader } from './telegram-ad-sales-pricing-reader';
import { materializeDefaultAdSalesProductsForChannels } from './telegram-ad-sales-default-products';

type HydratablePlacement = {
  telegramChannelId: string;
  managedPost?: { telegramMessageIds: string[] } | null;
  telegramPost?: {
    id: string;
    telegramMessageId: string;
    viewsCount: number | null;
    forwardsCount: number | null;
    reactionsCount: number | null;
    commentsCount: number | null;
    postDate: Date;
  } | null;
};

export class TelegramAdSalesAvailabilityReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingReader: TelegramAdSalesPricingReader,
    private readonly hydrateManagedTelegramPosts: (
      workspaceId: string,
      sales: Array<{ placements: HydratablePlacement[] }>,
    ) => Promise<void>,
  ) {}

  async read(
    workspaceId: string,
    dto: TelegramAdAvailabilityQueryDto,
    channelIds: string[],
  ) {
    const from = new Date(dto.from);
    const to = new Date(dto.to);
    const channels = await this.prisma.telegramChannel.findMany({
      where: { workspaceId, id: { in: channelIds } },
      include: {
        timePosts: { orderBy: [{ position: 'asc' }, { time: 'asc' }] },
      },
    });
    if (channels.length !== channelIds.length) {
      throw new BadRequestException(
        'Some channels do not belong to selected workspace',
      );
    }
    const historyWindowDays = 30;
    const historyFrom = new Date(
      from.getTime() - historyWindowDays * 24 * 60 * 60 * 1000,
    );
    const extendedTo = new Date(to.getTime() + 24 * 60 * 60 * 1000);
    const [
      workspace,
      workspaceSettings,
      policies,
      products,
      placements,
      telegramPosts,
      managedOrganicPosts,
      pricingSources,
    ] = await Promise.all([
      this.prisma.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        select: { timezone: true },
      }),
      this.prisma.telegramAdSalesWorkspaceSettings.findUnique({
        where: { workspaceId },
      }),
      this.prisma.telegramAdSchedulePolicy.findMany({
        where: { workspaceId, telegramChannelId: { in: channelIds } },
      }),
      this.prisma.telegramAdProduct.findMany({
        where: {
          workspaceId,
          telegramChannelId: { in: channelIds },
        },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.telegramAdSalePlacement.findMany({
        where: {
          workspaceId,
          telegramChannelId: { in: channelIds },
          status: { in: ACTIVE_TELEGRAM_AD_PLACEMENT_STATUSES },
          OR: [
            {
              scheduledAt: {
                gte: new Date(from.getTime() - 7 * 24 * 60 * 60 * 1000),
                lte: extendedTo,
              },
            },
            { inventoryOpportunityKey: { not: null } },
          ],
        },
        include: {
          managedPost: { select: { telegramMessageIds: true } },
          telegramPost: {
            select: {
              id: true,
              telegramMessageId: true,
              viewsCount: true,
              forwardsCount: true,
              reactionsCount: true,
              commentsCount: true,
              postDate: true,
            },
          },
        },
      }),
      this.prisma.telegramPost.findMany({
        where: {
          workspaceId,
          telegramChannelId: { in: channelIds },
          postDate: { gte: historyFrom, lte: extendedTo },
          excludeFromAnalytics: false,
          adSalePlacements: { none: {} },
        },
        select: {
          id: true,
          telegramChannelId: true,
          telegramMessageId: true,
          postDate: true,
        },
      }),
      this.prisma.telegramManagedPost.findMany({
        where: {
          workspaceId,
          telegramChannelId: { in: channelIds },
          status: {
            in: [
              TelegramManagedPostStatus.SCHEDULED,
              TelegramManagedPostStatus.PUBLISHED,
            ],
          },
          adSalePlacements: { none: {} },
          OR: [
            { scheduledAt: { gte: historyFrom, lte: extendedTo } },
            { publishedAt: { gte: historyFrom, lte: extendedTo } },
          ],
        },
        select: {
          id: true,
          telegramChannelId: true,
          scheduledAt: true,
          publishedAt: true,
          telegramMessageIds: true,
        },
      }),
      this.pricingReader.sourcesForChannels(workspaceId, channels),
    ]);
    const saleIds = [
      ...new Set(placements.map((placement) => placement.telegramAdSaleId)),
    ];
    const sales = saleIds.length
      ? await this.prisma.telegramAdSale.findMany({
          where: { workspaceId, id: { in: saleIds } },
          select: {
            id: true,
            title: true,
            advertiserName: true,
            advertiserNameSnapshot: true,
            status: true,
            placements: { select: { agreedPrice: true } },
            payments: {
              where: { status: TelegramAdSalePaymentStatus.ACTIVE },
              select: { amount: true },
            },
          },
        })
      : [];
    const salesById = new Map(
      sales.map((sale) => {
        const totalAgreed = sale.placements.reduce(
          (sum, placement) => sum.add(placement.agreedPrice),
          new Prisma.Decimal(0),
        );
        const totalPaid = sale.payments.reduce(
          (sum, payment) => sum.add(payment.amount),
          new Prisma.Decimal(0),
        );
        return [
          sale.id,
          {
            id: sale.id,
            title: sale.title,
            advertiserName: sale.advertiserName,
            advertiserNameSnapshot: sale.advertiserNameSnapshot,
            status: sale.status,
            paymentStatus: paymentStatus(totalPaid, totalAgreed),
          },
        ] as const;
      }),
    );
    const resolvedPlacements = placements.map((placement) => ({
      ...placement,
      sale: salesById.get(placement.telegramAdSaleId) ?? null,
    }));
    let resolvedProducts = products;
    const defaultsCreated = await materializeDefaultAdSalesProductsForChannels(
      this.prisma,
      {
        workspaceId,
        channels,
        existingProducts: products,
      },
    );
    if (defaultsCreated) {
      resolvedProducts = await this.prisma.telegramAdProduct.findMany({
        where: { workspaceId, telegramChannelId: { in: channelIds } },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      });
    }
    const activeProducts = resolvedProducts.filter(
      (product) =>
        product.isActive &&
        (!dto.productIds?.length || dto.productIds.includes(product.id)),
    );
    await this.hydrateManagedTelegramPosts(workspaceId, [
      { placements: resolvedPlacements },
    ]);

    const defaultCadence = workspaceSettings?.defaultOrganicPostsPerAdSlot ?? 3;
    const workspaceTimezone = workspace.timezone || 'Europe/Warsaw';
    const storedPolicyByChannel = new Map(
      policies.map((policy) => [policy.telegramChannelId, policy]),
    );
    const policyByChannel = new Map<string, AvailabilityPolicy>();
    for (const channel of channels) {
      const stored = storedPolicyByChannel.get(channel.id);
      policyByChannel.set(
        channel.id,
        stored
          ? {
              ...stored,
              organicPostsPerAdSlot: stored.useWorkspaceDefault
                ? defaultCadence
                : stored.organicPostsPerAdSlot,
            }
          : {
              timezone: workspaceTimezone,
              expectedOrganicPostsPerDay: null,
              organicPostsPerAdSlot: defaultCadence,
              maxAdsPerDay: 999,
              slotStrategy: TelegramAdSlotStrategy.BEFORE_ORGANIC_POST,
            },
      );
    }
    const productsByChannel = new Map<string, typeof activeProducts>();
    for (const product of activeProducts) {
      const current = productsByChannel.get(product.telegramChannelId) ?? [];
      current.push(product);
      productsByChannel.set(product.telegramChannelId, current);
    }
    const pricingByChannel = new Map(
      channels.map((channel) => [
        channel.id,
        this.pricingReader.previewFromSource(
          pricingSources.get(channel.id)!,
          productsByChannel.get(channel.id)?.[0] ?? null,
        ),
      ]),
    );
    return buildAdSalesAvailability({
      from,
      to,
      fromText: dto.from,
      toText: dto.to,
      historyFrom,
      historyWindowDays,
      channels,
      productsByChannel,
      policyByChannel,
      pricingByChannel,
      placements: resolvedPlacements,
      telegramPosts,
      managedOrganicPosts,
    });
  }
}

function paymentStatus(totalPaid: Prisma.Decimal, totalAgreed: Prisma.Decimal) {
  if (totalPaid.eq(0)) return 'UNPAID' as const;
  if (totalPaid.lt(totalAgreed)) return 'PARTIALLY_PAID' as const;
  if (totalPaid.eq(totalAgreed)) return 'PAID' as const;
  return 'OVERPAID' as const;
}
