import { Injectable } from '@nestjs/common';
import { Prisma, TransactionType } from '@prisma/client';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';

const dec = (value: unknown) => Number(value ?? 0);
const REVENUE_CATEGORY_KEY = 'channel_advertising_revenue';

function normalizedCategory(value: string | null | undefined) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function campaignPeriodWhere(
  workspaceId: string,
  from: Date,
  to: Date,
): Prisma.AdCampaignWhereInput {
  const range = { gte: from, lte: to };
  return {
    workspaceId,
    OR: [
      { placementDate: range },
      { placementDate: null, startedAt: range },
      { placementDate: null, startedAt: null, createdAt: range },
    ],
  };
}

@Injectable()
export class DashboardReadService {
  constructor(private readonly prisma: PrismaService) {}

  async load(workspaceId: string, from: Date, to: Date) {
    const period = { gte: from, lte: to };
    const [
      workspace,
      accounts,
      periodTransactions,
      periodCampaigns,
      campaignStatuses,
      channels,
      hypothesisStatuses,
      members,
      periodInvestments,
      categories,
      legacyCategories,
      transactionBalances,
      outgoingTransfers,
      incomingTransfers,
      totalInvestments,
      investmentsBeforePeriod,
    ] = await Promise.all([
      this.prisma.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        select: { primaryCurrency: true, secondaryCurrency: true },
      }),
      this.prisma.account.findMany({
        where: {
          workspaceId,
          isActive: true,
          OR: [
            { assignedMemberId: null },
            { assignedMember: { isHidden: false } },
          ],
        },
        include: {
          assignedMember: WorkspaceService.assignedMemberInclude,
          icon: {
            select: {
              id: true,
              type: true,
              name: true,
              emoji: true,
              imageUrl: true,
            },
          },
        },
      }),
      this.prisma.transaction.findMany({
        where: { workspaceId, deletedAt: null, date: period },
        select: {
          date: true,
          type: true,
          amountInPrimaryCurrency: true,
          telegramChannelId: true,
          category: true,
          categoryId: true,
          categoryRef: {
            select: {
              key: true,
              name: true,
              iconId: true,
              icon: {
                select: {
                  id: true,
                  type: true,
                  name: true,
                  emoji: true,
                  imageUrl: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.adCampaign.findMany({
        where: campaignPeriodWhere(workspaceId, from, to),
        include: {
          inviteLinks: { select: { joinedCount: true, requestedCount: true } },
          telegramChannel: {
            select: {
              id: true,
              title: true,
              username: true,
              photoUrl: true,
              kpiCurrency: true,
              targetCpaFrom: true,
              targetCpa: true,
              acceptableCpaFrom: true,
              acceptableCpa: true,
              stopCpaFrom: true,
              stopCpa: true,
            },
          },
          promo: { select: { title: true } },
        },
      }),
      this.prisma.adCampaign.groupBy({
        by: ['status'],
        where: { workspaceId },
        _count: { _all: true },
      }),
      this.prisma.telegramChannel.findMany({
        where: { workspaceId, archivedAt: null },
        select: {
          id: true,
          title: true,
          username: true,
          photoUrl: true,
          currentSubscribersCount: true,
          isActive: true,
          purchaseTransaction: {
            select: { id: true, amountInPrimaryCurrency: true, date: true },
          },
          adminLinks: { select: { id: true }, take: 1 },
          audienceSnapshots: {
            orderBy: { collectedAt: 'desc' },
            take: 1,
            select: {
              subscribersCount: true,
              activeSubscribersEstimate: true,
              viewRate: true,
              dataQuality: true,
              hasExternalTrafficAnomaly: true,
            },
          },
        },
      }),
      this.prisma.adHypothesis.groupBy({
        by: ['status'],
        where: { workspaceId },
        _count: { _all: true },
      }),
      this.prisma.workspaceMember.count({ where: { workspaceId } }),
      this.prisma.investment.findMany({
        where: { workspaceId, date: period },
        select: { id: true, amountInPrimaryCurrency: true, date: true },
      }),
      this.prisma.transactionCategory.findMany({
        where: { workspaceId },
        select: { id: true, key: true, name: true },
      }),
      this.prisma.transaction.groupBy({
        by: ['category'],
        where: { workspaceId, deletedAt: null, categoryId: null },
      }),
      this.prisma.transaction.groupBy({
        by: ['accountId', 'type'],
        where: { workspaceId, deletedAt: null },
        _sum: { amount: true },
      }),
      this.prisma.transfer.groupBy({
        by: ['fromAccountId'],
        where: { workspaceId, deletedAt: null },
        _sum: { fromAmount: true },
      }),
      this.prisma.transfer.groupBy({
        by: ['toAccountId'],
        where: { workspaceId, deletedAt: null },
        _sum: { toAmount: true },
      }),
      this.prisma.investment.aggregate({
        where: { workspaceId },
        _sum: { amountInPrimaryCurrency: true },
      }),
      this.prisma.investment.aggregate({
        where: { workspaceId, date: { lt: from } },
        _sum: { amountInPrimaryCurrency: true },
      }),
    ]);

    const revenueCategoryIds = categories
      .filter(
        (category) =>
          (category.key ?? normalizedCategory(category.name)) ===
          REVENUE_CATEGORY_KEY,
      )
      .map((category) => category.id);
    const legacyRevenueNames = legacyCategories
      .map((row) => row.category)
      .filter((name) => normalizedCategory(name) === REVENUE_CATEGORY_KEY);
    const revenueSelectors: Prisma.TransactionWhereInput[] = [];
    if (revenueCategoryIds.length) {
      revenueSelectors.push({ categoryId: { in: revenueCategoryIds } });
    }
    if (legacyRevenueNames.length) {
      revenueSelectors.push({
        categoryId: null,
        category: { in: legacyRevenueNames },
      });
    }
    const revenueWhere: Prisma.TransactionWhereInput = {
      workspaceId,
      deletedAt: null,
      OR: revenueSelectors,
    };
    const [
      revenueByChannel,
      revenueBeforePeriod,
      expenseTotals,
      expensesBeforePeriod,
    ] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['telegramChannelId'],
        where: revenueWhere,
        _sum: { amountInPrimaryCurrency: true },
      }),
      this.prisma.transaction.aggregate({
        where: { ...revenueWhere, date: { lt: from } },
        _sum: { amountInPrimaryCurrency: true },
      }),
      this.prisma.transaction.aggregate({
        where: {
          workspaceId,
          deletedAt: null,
          type: TransactionType.expense,
        },
        _sum: { amountInPrimaryCurrency: true },
      }),
      this.prisma.transaction.aggregate({
        where: {
          workspaceId,
          deletedAt: null,
          type: TransactionType.expense,
          date: { lt: from },
        },
        _sum: { amountInPrimaryCurrency: true },
      }),
    ]);

    const campaignStatusCounts = Object.fromEntries(
      campaignStatuses.map((row) => [row.status, row._count._all]),
    );
    const hypothesisStatusCounts = Object.fromEntries(
      hypothesisStatuses.map((row) => [row.status, row._count._all]),
    );
    const incomeByAccount = new Map<string, number>();
    const expenseByAccount = new Map<string, number>();
    for (const row of transactionBalances) {
      const target =
        row.type === TransactionType.income
          ? incomeByAccount
          : expenseByAccount;
      target.set(row.accountId, dec(row._sum.amount));
    }
    const outgoingByAccount = new Map(
      outgoingTransfers.map((row) => [
        row.fromAccountId,
        dec(row._sum.fromAmount),
      ]),
    );
    const incomingByAccount = new Map(
      incomingTransfers.map((row) => [row.toAccountId, dec(row._sum.toAmount)]),
    );
    const accountRows = accounts.map((account) => ({
      account,
      balance:
        dec(account.initialBalance) +
        (incomeByAccount.get(account.id) ?? 0) -
        (expenseByAccount.get(account.id) ?? 0) -
        (outgoingByAccount.get(account.id) ?? 0) +
        (incomingByAccount.get(account.id) ?? 0),
    }));
    const allTimeRevenue = revenueByChannel.reduce(
      (sum, row) => sum + dec(row._sum.amountInPrimaryCurrency),
      0,
    );
    const totalExpenses = dec(expenseTotals._sum.amountInPrimaryCurrency);

    return {
      workspace,
      periodTransactions,
      periodCampaigns,
      channels,
      members,
      periodInvestments,
      accountRows,
      campaignStatusCounts,
      campaignsCount: campaignStatuses.reduce(
        (sum, row) => sum + row._count._all,
        0,
      ),
      hypothesisStatusCounts,
      totalInvestedPrimary: dec(totalInvestments._sum.amountInPrimaryCurrency),
      operatingProfitAllTime: allTimeRevenue - totalExpenses,
      cumulativeBeforePeriod:
        dec(revenueBeforePeriod._sum.amountInPrimaryCurrency) -
        dec(expensesBeforePeriod._sum.amountInPrimaryCurrency) -
        dec(investmentsBeforePeriod._sum.amountInPrimaryCurrency),
      revenueByChannel: new Map(
        revenueByChannel
          .filter((row) => row.telegramChannelId)
          .map((row) => [
            row.telegramChannelId!,
            dec(row._sum.amountInPrimaryCurrency),
          ]),
      ),
    };
  }

  async loadSelectedInviteLinks(workspaceId: string, ids: string[]) {
    if (!ids.length) return [];
    return this.prisma.telegramInviteLink.findMany({
      where: { workspaceId, id: { in: ids } },
      select: { id: true, joinedCount: true, requestedCount: true },
    });
  }
}
