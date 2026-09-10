import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { FinanceAnalyticsService } from '../analytics/finance-analytics.service';
import type { FinanceAssetSummaryService } from '../assets/finance-asset-summary.service';
import { financeBalanceSummary } from './finance-balance-summary';

type FinanceStatsAccount = {
  id: string;
  name: string;
  currency: string;
  balance: string;
  equivalentBalance?: { amount: string; currency: string } | null;
  archivedAt?: Date | string | null;
};

export async function financeLedgerStats(input: {
  prisma: PrismaService;
  analytics: FinanceAnalyticsService;
  assets?: FinanceAssetSummaryService;
  profileId: string;
  from: Date;
  to: Date;
  loadAccounts: (
    profileId: string,
    currency: string,
    workspaceId: string,
  ) => Promise<FinanceStatsAccount[]>;
}) {
  if (
    input.to <= input.from ||
    input.to.getTime() - input.from.getTime() > 366 * 86400000
  )
    throw new BadRequestException('Invalid or unbounded statistics range');
  const profile = await input.prisma.financeProfile.findUnique({
    where: { id: input.profileId },
    select: {
      id: true,
      defaultCurrency: true,
      timezone: true,
      botIntegration: { select: { workspaceId: true } },
    },
  });
  if (!profile) throw new NotFoundException('Finance profile not found');
  const [analytics, accounts] = await Promise.all([
    input.analytics.dashboard(
      {
        id: profile.id,
        defaultCurrency: profile.defaultCurrency,
        timezone: profile.timezone,
        workspaceId: profile.botIntegration.workspaceId,
      },
      input.from,
      input.to,
    ),
    input.loadAccounts(
      profile.id,
      profile.defaultCurrency,
      profile.botIntegration.workspaceId,
    ),
  ]);
  const totalBalance = financeBalanceSummary(accounts, profile.defaultCurrency);
  const assets = input.assets
    ? await input.assets.overview(profile.id, totalBalance)
    : undefined;
  return {
    income: analytics.summary.income,
    expense: analytics.summary.expenses,
    saved: analytics.summary.saved,
    invested: analytics.summary.invested,
    investmentReturns: analytics.summary.investmentReturns,
    net: analytics.summary.netCashflow,
    categories: analytics.expensesByCategory.map((row) => ({
      categoryId: row.categoryId,
      categoryKey: row.categoryKey,
      name: row.name,
      amount: row.amount,
    })),
    accounts,
    totalBalance,
    ...(assets || {}),
  };
}
