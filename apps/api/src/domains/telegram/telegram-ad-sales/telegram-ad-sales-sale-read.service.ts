import { Injectable } from '@nestjs/common';
import type {
  TelegramAdSaleListItem,
  TelegramAdSaleListPlacement,
} from '@telegram-system/shared';
import { Prisma, TelegramAdSalePaymentStatus } from '@prisma/client';
import {
  createPaginatedResponse,
  normalizePagination,
} from '../../../common/pagination/pagination.utils';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { buildStableTelegramPostUrl } from '../../../telegram/shared/telegram-post-url';
import { decimal, decimalToString } from './domain/decimal';
import { calculateAdPlacementDeleteAt } from './domain/sales-text';
import { TelegramAdSalesQueryDto } from './dto';
import { buildTelegramAdSaleListWhere } from './telegram-ad-sales-sale-list-query';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { adSalesAuthorizationTestFallback } from './telegram-ad-sales-authorization-test-fallback';

const SALE_LIST_SELECT = {
  id: true,
  workspaceId: true,
  advertiserId: true,
  advertiserName: true,
  advertiserTelegram: true,
  advertiserContact: true,
  advertiserNameSnapshot: true,
  advertiserTelegramSnapshot: true,
  advertiserCompanySnapshot: true,
  title: true,
  notes: true,
  status: true,
  origin: true,
  crmDealStage: true,
  expectedCloseAt: true,
  lostReason: true,
  nextActionAt: true,
  settlementCurrency: true,
  reservedUntil: true,
  financeSkipped: true,
  sourceTaskId: true,
  sourceAdvertiserActivityId: true,
  createdByUserId: true,
  assignedMemberId: true,
  createdAt: true,
  updatedAt: true,
  assignedMember: {
    select: {
      id: true,
      telegramUsername: true,
      avatarIcon: {
        select: {
          id: true,
          type: true,
          name: true,
          emoji: true,
          imageUrl: true,
        },
      },
      user: { select: { name: true, email: true } },
    },
  },
  advertiser: {
    select: {
      displayName: true,
      telegramUsername: true,
    },
  },
  placements: {
    orderBy: { scheduledAt: 'asc' as const },
    select: {
      id: true,
      workspaceId: true,
      telegramAdSaleId: true,
      telegramChannelId: true,
      telegramChannelNetworkId: true,
      telegramAdProductId: true,
      inventoryOpportunityKey: true,
      pricingSnapshotId: true,
      status: true,
      scheduledAt: true,
      timezone: true,
      pricingMode: true,
      expectedViews: true,
      quotedCpm: true,
      recommendedPrice: true,
      minimumPrice: true,
      agreedPrice: true,
      currency: true,
      scheduledManagedAt: true,
      topDurationMinutesSnapshot: true,
      feedDurationHoursSnapshot: true,
      deleteAfterHoursSnapshot: true,
      isPermanentSnapshot: true,
      manualPriceReason: true,
      managedPostId: true,
      telegramPostId: true,
      publishedAt: true,
      plannedDeleteAt: true,
      deletedAt: true,
      lastDeletionAttemptAt: true,
      lastDeletionError: true,
      actualViews24h: true,
      actualViews48h: true,
      actualViewsFinal: true,
      actualReactionsFinal: true,
      actualCpm: true,
      completedAt: true,
      createdAt: true,
      updatedAt: true,
      telegramChannel: { select: { telegramChatId: true } },
      managedPost: {
        select: {
          status: true,
          publishedAt: true,
          lastError: true,
          telegramMessageIds: true,
          telegramMessageUrls: true,
          telegramRemoteStatus: true,
        },
      },
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
      paymentAllocations: {
        select: {
          amount: true,
          payment: { select: { status: true } },
        },
      },
    },
  },
} satisfies Prisma.TelegramAdSaleSelect;

type SaleListRow = Prisma.TelegramAdSaleGetPayload<{
  select: typeof SALE_LIST_SELECT;
}>;
type SaleListPlacement = SaleListRow['placements'][number];
type PaymentRow = {
  telegramAdSaleId: string;
  amount: Prisma.Decimal;
  amountInPrimaryCurrency: Prisma.Decimal;
  status: TelegramAdSalePaymentStatus;
};

function paymentStatus(totalPaid: Prisma.Decimal, totalAgreed: Prisma.Decimal) {
  if (totalPaid.eq(0)) return 'UNPAID' as const;
  if (totalPaid.lt(totalAgreed)) return 'PARTIALLY_PAID' as const;
  if (totalPaid.eq(totalAgreed)) return 'PAID' as const;
  return 'OVERPAID' as const;
}

@Injectable()
export class TelegramAdSalesSaleReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly authorization: WorkspaceAuthorizationService = adSalesAuthorizationTestFallback(workspaceService),
  ) {}

  async listSales(userId: string, query: TelegramAdSalesQueryDto) {
    const access = await this.authorization.require(userId, 'adSales.sales.view');
    const workspaceId = access.workspaceId;
    const pagination = normalizePagination(query);
    const advertiser = query.advertiserId
      ? await this.prisma.telegramAdvertiser.findFirst({
          where: { id: query.advertiserId, workspaceId },
          select: { telegramUsername: true },
        })
      : null;
    const where: Prisma.TelegramAdSaleWhereInput = buildTelegramAdSaleListWhere(
      workspaceId,
      query,
      advertiser?.telegramUsername,
    );
    if (
      (await this.authorization.can(userId, 'adSales.sales.editOwn')) &&
      !(await this.authorization.can(userId, 'adSales.sales.editAny'))
    ) where.assignedMemberId = access.memberId;
    const [sales, totalItems] = await this.prisma.$transaction([
      this.prisma.telegramAdSale.findMany({
        where,
        select: SALE_LIST_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.telegramAdSale.count({ where }),
    ]);
    const saleIds = sales.map((sale) => sale.id);
    const payments: PaymentRow[] = saleIds.length
      ? await this.prisma.telegramAdSalePayment.findMany({
          where: { workspaceId, telegramAdSaleId: { in: saleIds } },
          select: {
            telegramAdSaleId: true,
            amount: true,
            amountInPrimaryCurrency: true,
            status: true,
          },
        })
      : [];
    const managedMetrics = await this.managedPostMetrics(workspaceId, sales);
    const paymentsBySale = new Map<string, PaymentRow[]>();
    for (const payment of payments) {
      const current = paymentsBySale.get(payment.telegramAdSaleId) ?? [];
      current.push(payment);
      paymentsBySale.set(payment.telegramAdSaleId, current);
    }
    return createPaginatedResponse(
      sales.map((sale) =>
        this.mapSale(sale, paymentsBySale.get(sale.id) ?? [], managedMetrics),
      ),
      totalItems,
      pagination,
    );
  }

  private async managedPostMetrics(workspaceId: string, sales: SaleListRow[]) {
    const keys = new Map<
      string,
      { telegramChannelId: string; telegramMessageId: string }
    >();
    for (const sale of sales) {
      for (const placement of sale.placements) {
        for (const telegramMessageId of placement.managedPost
          ?.telegramMessageIds ?? []) {
          keys.set(`${placement.telegramChannelId}:${telegramMessageId}`, {
            telegramChannelId: placement.telegramChannelId,
            telegramMessageId,
          });
        }
      }
    }
    if (!keys.size)
      return new Map<string, Awaited<ReturnType<typeof load>>[number]>();
    const posts = await load(this.prisma, workspaceId, [...keys.values()]);
    return new Map(
      posts.map((post) => [
        `${post.telegramChannelId}:${post.telegramMessageId}`,
        post,
      ]),
    );
  }

  private mapSale(
    sale: SaleListRow,
    paymentRows: PaymentRow[],
    managedMetrics: Map<string, Awaited<ReturnType<typeof load>>[number]>,
  ): TelegramAdSaleListItem {
    const placements = sale.placements.map((placement) =>
      this.mapPlacement(placement, managedMetrics),
    );
    const activePayments = paymentRows.filter(
      (payment) => payment.status !== TelegramAdSalePaymentStatus.VOIDED,
    );
    const totalAgreed = sale.placements.reduce(
      (sum, placement) => sum.add(placement.agreedPrice),
      decimal(0),
    );
    const totalRecommended = sale.placements.reduce(
      (sum, placement) => sum.add(placement.recommendedPrice),
      decimal(0),
    );
    const totalMinimum = sale.placements.reduce(
      (sum, placement) => sum.add(placement.minimumPrice),
      decimal(0),
    );
    const totalPaid = activePayments.reduce(
      (sum, payment) => sum.add(payment.amount),
      decimal(0),
    );
    const totalPrimary = activePayments.reduce(
      (sum, payment) => sum.add(payment.amountInPrimaryCurrency),
      decimal(0),
    );
    const outstanding = totalPaid.gte(totalAgreed)
      ? decimal(0)
      : totalAgreed.sub(totalPaid);
    const overpaid = totalPaid.gt(totalAgreed)
      ? totalPaid.sub(totalAgreed)
      : decimal(0);
    return {
      id: sale.id,
      workspaceId: sale.workspaceId,
      advertiserId: sale.advertiserId,
      advertiserName: sale.advertiserName,
      advertiserTelegram: sale.advertiserTelegram,
      advertiserContact: sale.advertiserContact,
      advertiserNameSnapshot: sale.advertiserNameSnapshot,
      advertiserTelegramSnapshot: sale.advertiserTelegramSnapshot,
      advertiserCompanySnapshot: sale.advertiserCompanySnapshot,
      advertiserSummary: sale.advertiser
        ? {
            displayName: sale.advertiser.displayName,
            telegramUsername: sale.advertiser.telegramUsername,
          }
        : null,
      title: sale.title,
      notes: sale.notes,
      status: sale.status,
      origin: sale.origin,
      crmDealStage: sale.crmDealStage,
      expectedCloseAt: sale.expectedCloseAt?.toISOString() ?? null,
      lostReason: sale.lostReason,
      nextActionAt: sale.nextActionAt?.toISOString() ?? null,
      settlementCurrency: sale.settlementCurrency,
      reservedUntil: sale.reservedUntil?.toISOString() ?? null,
      financeSkipped: sale.financeSkipped,
      sourceTaskId: sale.sourceTaskId,
      sourceAdvertiserActivityId: sale.sourceAdvertiserActivityId,
      createdByUserId: sale.createdByUserId,
      assignedMemberId: sale.assignedMemberId,
      assignedMember: sale.assignedMember
        ? {
            id: sale.assignedMember.id,
            name:
              sale.assignedMember.user?.name ||
              sale.assignedMember.telegramUsername ||
              sale.assignedMember.user?.email ||
              'Workspace member',
            email: sale.assignedMember.user?.email ?? null,
            avatarPresentation: iconToResolvedEmoji(
              sale.assignedMember.avatarIcon,
            ),
          }
        : null,
      createdAt: sale.createdAt.toISOString(),
      updatedAt: sale.updatedAt.toISOString(),
      placements,
      placementsCount: placements.length,
      totalAgreedAmount: decimalToString(totalAgreed),
      totalRecommendedAmount: decimalToString(totalRecommended),
      totalMinimumAmount: decimalToString(totalMinimum),
      totalPaidAmount: decimalToString(totalPaid),
      outstandingAmount: decimalToString(outstanding),
      overpaidAmount: decimalToString(overpaid),
      paymentStatus: paymentStatus(totalPaid, totalAgreed),
      totalAmountInPrimaryCurrency: decimalToString(totalPrimary),
      channelBreakdown: placements.map((placement) => ({
        placementId: placement.id,
        channelId: placement.telegramChannelId,
        agreedPrice: placement.agreedPrice,
        paidAllocatedAmount: placement.paidAllocatedAmount ?? '0',
        unpaidAmount: placement.unpaidAmount ?? placement.agreedPrice,
        recommendedPrice: placement.recommendedPrice,
        minimumPrice: placement.minimumPrice,
        underpricingAmount: placement.underpricingAmount ?? '0',
        underpricingPercent: placement.underpricingPercent ?? '0',
        status: placement.status,
      })),
    };
  }

  private mapPlacement(
    placement: SaleListPlacement,
    managedMetrics: Map<string, Awaited<ReturnType<typeof load>>[number]>,
  ): TelegramAdSaleListPlacement {
    const hydratedPost =
      placement.telegramPost ??
      placement.managedPost?.telegramMessageIds
        .map((messageId) =>
          managedMetrics.get(`${placement.telegramChannelId}:${messageId}`),
        )
        .find(Boolean) ??
      null;
    const paid = placement.paymentAllocations
      .filter(
        (allocation) =>
          allocation.payment.status !== TelegramAdSalePaymentStatus.VOIDED,
      )
      .reduce((sum, allocation) => sum.add(allocation.amount), decimal(0));
    const unpaid = placement.agreedPrice.sub(paid);
    const underpricing = placement.minimumPrice.gt(placement.agreedPrice)
      ? placement.minimumPrice.sub(placement.agreedPrice)
      : decimal(0);
    const underpricingPercent =
      placement.minimumPrice.gt(0) && underpricing.gt(0)
        ? underpricing.div(placement.minimumPrice).mul(100)
        : decimal(0);
    const effectivePublishedAt =
      placement.publishedAt ??
      hydratedPost?.postDate ??
      placement.managedPost?.publishedAt ??
      null;
    const effectiveDeleteAt = calculateAdPlacementDeleteAt({
      scheduledAt: placement.scheduledAt,
      publishedAt: effectivePublishedAt,
      deleteAfterHoursSnapshot: placement.deleteAfterHoursSnapshot,
      isPermanentSnapshot: placement.isPermanentSnapshot,
    });
    return {
      id: placement.id,
      workspaceId: placement.workspaceId,
      telegramAdSaleId: placement.telegramAdSaleId,
      telegramChannelId: placement.telegramChannelId,
      telegramChannelNetworkId: placement.telegramChannelNetworkId,
      telegramAdProductId: placement.telegramAdProductId,
      inventoryOpportunityKey: placement.inventoryOpportunityKey,
      pricingSnapshotId: placement.pricingSnapshotId,
      status: placement.status,
      scheduledAt: placement.scheduledAt.toISOString(),
      timezone: placement.timezone,
      pricingMode: placement.pricingMode,
      expectedViews: placement.expectedViews,
      quotedCpm: decimalToString(placement.quotedCpm),
      recommendedPrice: decimalToString(placement.recommendedPrice)!,
      minimumPrice: decimalToString(placement.minimumPrice)!,
      agreedPrice: decimalToString(placement.agreedPrice)!,
      currency: placement.currency,
      scheduledManagedAt: placement.scheduledManagedAt?.toISOString() ?? null,
      topDurationMinutesSnapshot: placement.topDurationMinutesSnapshot,
      feedDurationHoursSnapshot: placement.feedDurationHoursSnapshot,
      deleteAfterHoursSnapshot: placement.deleteAfterHoursSnapshot,
      isPermanentSnapshot: placement.isPermanentSnapshot,
      manualPriceReason: placement.manualPriceReason,
      managedPostId: placement.managedPostId,
      managedPost: placement.managedPost
        ? {
            status: placement.managedPost.status,
            lastError: placement.managedPost.lastError,
            telegramMessageIds: placement.managedPost.telegramMessageIds,
            telegramMessageUrls: placement.managedPost.telegramMessageUrls,
            telegramRemoteStatus: placement.managedPost.telegramRemoteStatus,
          }
        : null,
      telegramPostId: placement.telegramPostId,
      telegramPostUrl:
        placement.managedPost?.telegramMessageUrls?.[0] ??
        buildStableTelegramPostUrl({
          telegramChatId: placement.telegramChannel?.telegramChatId,
          messageId: hydratedPost?.telegramMessageId,
        }),
      telegramPost: hydratedPost
        ? {
            id: hydratedPost.id,
            telegramMessageId: hydratedPost.telegramMessageId,
            viewsCount: hydratedPost.viewsCount,
            forwardsCount: hydratedPost.forwardsCount,
            reactionsCount: hydratedPost.reactionsCount,
            commentsCount: hydratedPost.commentsCount,
            postDate: hydratedPost.postDate.toISOString(),
          }
        : null,
      publishedAt: effectivePublishedAt?.toISOString() ?? null,
      plannedDeleteAt:
        placement.isPermanentSnapshot ||
        placement.deleteAfterHoursSnapshot != null
          ? (effectiveDeleteAt?.toISOString() ?? null)
          : (placement.plannedDeleteAt?.toISOString() ?? null),
      deletedAt: placement.deletedAt?.toISOString() ?? null,
      lastDeletionAttemptAt:
        placement.lastDeletionAttemptAt?.toISOString() ?? null,
      lastDeletionError: placement.lastDeletionError,
      actualViews24h: placement.actualViews24h,
      actualViews48h: placement.actualViews48h,
      actualViewsFinal: placement.actualViewsFinal,
      actualReactionsFinal: placement.actualReactionsFinal,
      actualCpm: decimalToString(placement.actualCpm),
      completedAt: placement.completedAt?.toISOString() ?? null,
      createdAt: placement.createdAt.toISOString(),
      updatedAt: placement.updatedAt.toISOString(),
      paidAllocatedAmount: decimalToString(paid),
      unpaidAmount: decimalToString(unpaid),
      underpricingAmount: decimalToString(underpricing),
      underpricingPercent: decimalToString(underpricingPercent),
    };
  }
}

function load(
  prisma: PrismaService,
  workspaceId: string,
  keys: Array<{ telegramChannelId: string; telegramMessageId: string }>,
) {
  return prisma.telegramPost.findMany({
    where: { workspaceId, OR: keys },
    select: {
      id: true,
      telegramChannelId: true,
      telegramMessageId: true,
      viewsCount: true,
      forwardsCount: true,
      reactionsCount: true,
      commentsCount: true,
      postDate: true,
    },
  });
}
