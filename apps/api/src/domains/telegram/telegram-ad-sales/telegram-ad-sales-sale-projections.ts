import { NotFoundException } from '@nestjs/common';
import { Prisma, TelegramAdSalePaymentStatus } from '@prisma/client';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import { telegramAdvertiserCompatibilityInclude } from './telegram-ad-sales-advertiser-read-model';
import { buildStableTelegramPostUrl } from '@api/telegram/shared/imports/telegram-post-url';
import { decimal, decimalToString } from './domain/decimal';
import { calculateAdPlacementDeleteAt } from './domain/sales-text';
import { hydrateManagedTelegramPosts } from './telegram-ad-sales-managed-post-metrics';
import type { TelegramAdSalesOperations } from './telegram-ad-sales.service';

export function mapPlacement(_operations: unknown, placement: any) {
  const hasLifecyclePolicy = placement.isPermanentSnapshot || placement.deleteAfterHoursSnapshot != null;
  const effectivePlannedDeleteAt = calculateAdPlacementDeleteAt({
    scheduledAt: placement.scheduledAt,
    publishedAt: placement.publishedAt,
    deleteAfterHoursSnapshot: placement.deleteAfterHoursSnapshot,
    isPermanentSnapshot: placement.isPermanentSnapshot,
  });
  return {
    ...placement,
    telegramPostUrl:
      placement.managedPost?.telegramMessageUrls?.[0] ??
      buildStableTelegramPostUrl({
        telegramChatId: placement.telegramChannel?.telegramChatId,
        messageId: placement.telegramPost?.telegramMessageId,
      }),
    quotedCpm: decimalToString(placement.quotedCpm),
    recommendedPrice: decimalToString(placement.recommendedPrice),
    minimumPrice: decimalToString(placement.minimumPrice),
    agreedPrice: decimalToString(placement.agreedPrice),
    actualCpm: decimalToString(placement.actualCpm),
    scheduledAt: placement.scheduledAt.toISOString(),
    scheduledManagedAt: placement.scheduledManagedAt?.toISOString() ?? null,
    publishedAt: placement.publishedAt?.toISOString() ?? null,
    plannedDeleteAt: hasLifecyclePolicy
      ? (effectivePlannedDeleteAt?.toISOString() ?? null)
      : (placement.plannedDeleteAt?.toISOString() ?? null),
    deletedAt: placement.deletedAt?.toISOString() ?? null,
    lastDeletionAttemptAt: placement.lastDeletionAttemptAt?.toISOString() ?? null,
    completedAt: placement.completedAt?.toISOString() ?? null,
    createdAt: placement.createdAt.toISOString(),
    updatedAt: placement.updatedAt.toISOString(),
    paidAllocatedAmount: decimalToString(placement.paidAllocatedAmount),
    unpaidAmount: decimalToString(placement.unpaidAmount),
    underpricingAmount: decimalToString(placement.underpricingAmount),
    underpricingPercent: decimalToString(placement.underpricingPercent),
  };
}

export function mapPayment(_operations: unknown, payment: any) {
  return {
    ...payment,
    amount: decimalToString(payment.amount),
    amountInPrimaryCurrency: decimalToString(payment.amountInPrimaryCurrency),
    exchangeRateToPrimary: decimalToString(payment.exchangeRateToPrimary),
    paidAt: payment.paidAt.toISOString(),
    voidedAt: payment.voidedAt?.toISOString() ?? null,
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
    allocations: Array.isArray(payment.allocations)
      ? payment.allocations.map((allocation: any) => ({
          ...allocation,
          amount: decimalToString(allocation.amount),
          amountInPrimaryCurrency: decimalToString(allocation.amountInPrimaryCurrency),
          createdAt: allocation.createdAt.toISOString(),
        }))
      : [],
  };
}

export function mapSale(
  operations: Pick<
    TelegramAdSalesOperations,
    'buildSaleSummary' | 'mapAdvertiser' | 'mapPayment' | 'mapPlacement'
  >,
  sale: any,
) {
  const detailed = operations.buildSaleSummary(sale);
  return {
    ...sale,
    financeSkipped: sale.financeSkipped && detailed.payments.length === 0,
    assignedMember: sale.assignedMember
      ? {
          id: sale.assignedMember.id,
          name:
            sale.assignedMember.user?.name ||
            sale.assignedMember.telegramUsername ||
            sale.assignedMember.user?.email ||
            'Workspace member',
          email: sale.assignedMember.user?.email ?? null,
          avatarPresentation: iconToResolvedEmoji(sale.assignedMember.avatarIcon),
        }
      : null,
    sellerMemberId: sale.sellerMemberId ?? null,
    sellerMember: sale.sellerMember
      ? {
          id: sale.sellerMember.id,
          name:
            sale.sellerMember.user?.name ||
            sale.sellerMember.telegramUsername ||
            sale.sellerMember.user?.email ||
            'Workspace member',
          email: sale.sellerMember.user?.email ?? null,
          avatarPresentation: iconToResolvedEmoji(sale.sellerMember.avatarIcon),
        }
      : null,
    reservedUntil: sale.reservedUntil?.toISOString() ?? null,
    createdAt: sale.createdAt.toISOString(),
    updatedAt: sale.updatedAt.toISOString(),
    placements: detailed.placements.map((placement: any) => operations.mapPlacement(placement)),
    payments: detailed.payments.map((payment: any) => operations.mapPayment(payment)),
    advertiser: sale.advertiser ? operations.mapAdvertiser(sale.advertiser) : null,
    ...detailed.summary,
  };
}

export function includeSaleRelations(_operations: unknown) {
  return {
    advertiser: {
      include: telegramAdvertiserCompatibilityInclude,
    },
    sellerMember: {
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
    placements: {
      orderBy: { scheduledAt: 'asc' as const },
      include: {
        telegramChannel: {
          select: { telegramChatId: true, username: true },
        },
        paymentAllocations: {
          include: { payment: true },
        },
        managedPost: {
          select: {
            id: true,
            title: true,
            text: true,
            imageUrls: true,
            mediaItems: true,
            buttonRows: true,
            telegramChannelId: true,
            sourceType: true,
            sourceId: true,
            status: true,
            telegramRemoteStatus: true,
            telegramScheduledMessageIds: true,
            telegramMessageIds: true,
            telegramMessageUrls: true,
            publishedAt: true,
            scheduledAt: true,
            lastError: true,
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
      },
    },
    payments: {
      orderBy: { paidAt: 'asc' as const },
      include: {
        allocations: true,
        account: {
          select: {
            id: true,
            name: true,
            currency: true,
          },
        },
        transaction: {
          select: {
            id: true,
            date: true,
            amount: true,
            type: true,
            category: true,
          },
        },
        reversalTransaction: {
          select: {
            id: true,
            date: true,
            amount: true,
            type: true,
            category: true,
          },
        },
      },
    },
  };
}

export function paymentStatusFromTotals(
  _operations: unknown,
  totalPaid: Prisma.Decimal,
  totalAgreed: Prisma.Decimal,
) {
  if (totalPaid.eq(0)) return 'UNPAID';
  if (totalPaid.lt(totalAgreed)) return 'PARTIALLY_PAID';
  if (totalPaid.eq(totalAgreed)) return 'PAID';
  return 'OVERPAID';
}

export function appendPlacementFinancials(_operations: unknown, placement: any) {
  const paidAllocatedAmount = (placement.paymentAllocations ?? [])
    .filter((allocation: any) => allocation.payment?.status !== TelegramAdSalePaymentStatus.VOIDED)
    .reduce((sum: Prisma.Decimal, allocation: any) => sum.add(decimal(allocation.amount)), decimal(0));
  const unpaidAmount = decimal(placement.agreedPrice).sub(paidAllocatedAmount);
  const underpricingAmount = decimal(placement.minimumPrice).gt(decimal(placement.agreedPrice))
    ? decimal(placement.minimumPrice).sub(decimal(placement.agreedPrice))
    : decimal(0);
  const underpricingPercent =
    decimal(placement.minimumPrice).gt(0) && underpricingAmount.gt(0)
      ? underpricingAmount.div(decimal(placement.minimumPrice)).mul(100)
      : decimal(0);
  return {
    ...placement,
    paidAllocatedAmount,
    unpaidAmount,
    underpricingAmount,
    underpricingPercent,
  };
}

export function buildSaleSummary(
  operations: Pick<TelegramAdSalesOperations, 'appendPlacementFinancials' | 'paymentStatusFromTotals'>,
  sale: any,
) {
  const placements = (sale.placements ?? []).map((placement: any) =>
    operations.appendPlacementFinancials(placement),
  );
  const payments = (sale.payments ?? []).filter(
    (payment: any) => payment.status !== TelegramAdSalePaymentStatus.VOIDED,
  );
  const totalAgreedAmount = placements.reduce(
    (sum: Prisma.Decimal, placement: any) => sum.add(decimal(placement.agreedPrice)),
    decimal(0),
  );
  const totalRecommendedAmount = placements.reduce(
    (sum: Prisma.Decimal, placement: any) => sum.add(decimal(placement.recommendedPrice)),
    decimal(0),
  );
  const totalMinimumAmount = placements.reduce(
    (sum: Prisma.Decimal, placement: any) => sum.add(decimal(placement.minimumPrice)),
    decimal(0),
  );
  const totalPaidAmount = payments.reduce(
    (sum: Prisma.Decimal, payment: any) => sum.add(decimal(payment.amount)),
    decimal(0),
  );
  const totalAmountInPrimaryCurrency = payments.reduce(
    (sum: Prisma.Decimal, payment: any) => sum.add(decimal(payment.amountInPrimaryCurrency)),
    decimal(0),
  );
  const outstandingAmount = totalPaidAmount.gte(totalAgreedAmount)
    ? decimal(0)
    : totalAgreedAmount.sub(totalPaidAmount);
  const overpaidAmount = totalPaidAmount.gt(totalAgreedAmount)
    ? totalPaidAmount.sub(totalAgreedAmount)
    : decimal(0);

  const channelBreakdown = placements.map((placement: any) => ({
    placementId: placement.id,
    channelId: placement.telegramChannelId,
    agreedPrice: decimalToString(decimal(placement.agreedPrice)),
    paidAllocatedAmount: decimalToString(placement.paidAllocatedAmount),
    unpaidAmount: decimalToString(placement.unpaidAmount),
    recommendedPrice: decimalToString(decimal(placement.recommendedPrice)),
    minimumPrice: decimalToString(decimal(placement.minimumPrice)),
    underpricingAmount: decimalToString(placement.underpricingAmount),
    underpricingPercent: decimalToString(placement.underpricingPercent),
    status: placement.status,
  }));

  return {
    placements,
    payments,
    summary: {
      placementsCount: placements.length,
      totalAgreedAmount: decimalToString(totalAgreedAmount),
      totalRecommendedAmount: decimalToString(totalRecommendedAmount),
      totalMinimumAmount: decimalToString(totalMinimumAmount),
      totalPaidAmount: decimalToString(totalPaidAmount),
      outstandingAmount: decimalToString(outstandingAmount),
      overpaidAmount: decimalToString(overpaidAmount),
      paymentStatus: operations.paymentStatusFromTotals(totalPaidAmount, totalAgreedAmount),
      totalAmountInPrimaryCurrency: decimalToString(totalAmountInPrimaryCurrency),
      channelBreakdown,
    },
  };
}

export async function getSaleDetails(
  operations: Pick<TelegramAdSalesOperations, 'includeSaleRelations' | 'prisma'>,
  workspaceId: string,
  id: string,
) {
  const sale = await operations.prisma.telegramAdSale.findFirst({
    where: { id, workspaceId },
    include: operations.includeSaleRelations(),
  });
  if (!sale) throw new NotFoundException('Telegram ad sale not found');
  await hydrateManagedTelegramPosts(operations.prisma, workspaceId, [sale]);
  return sale;
}
