import { Injectable } from '@nestjs/common';
import {
  inviteLinkJoinedSubscribers,
  sumInviteLinkAttributedSubscribers,
  sumInviteLinkJoinedSubscribers,
} from '../../../common/analytics/invite-link-metrics';
import {
  CurrencyConversionService,
  type PreparedCurrencyRateSource,
} from '../../../common/currency-conversion.service';
import { resolveChannelKpiStatus } from '../../../common/analytics/channel-financial-summary';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import { WorkspaceService } from '../../../common/workspace.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import {
  dashboardDateRange,
  dashboardIsoDay,
  dashboardPeriodDays,
} from './dashboard-period';
import { DashboardReadService } from './dashboard-read.service';
import { buildDashboardTrend } from './dashboard-trend';
import {
  dashboardReadAccess,
  dashboardCategoryKey,
  filterDashboardSurface,
  type DashboardReadAccess,
} from './dashboard-surface';

const dec = (v: unknown) => Number(v ?? 0);
type DashboardCampaign = Awaited<
  ReturnType<DashboardReadService['load']>
>['periodCampaigns'][number];
type DatedDashboardCampaign = Pick<
  DashboardCampaign,
  'placementDate' | 'startedAt' | 'createdAt'
>;

@Injectable()
export class DashboardService {
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly conversionService: CurrencyConversionService,
    private readonly reads: DashboardReadService,
    private readonly authorization?: WorkspaceAuthorizationService,
  ) {}

  async summary(
    userId: string,
    input?: { dateFrom?: string; dateTo?: string },
  ) {
    const authorization = this.authorization;
    if (!authorization) {
      const workspaceId =
        await this.workspaceService.resolveWorkspaceIdForUser(userId);
      const { from, to } = dashboardDateRange(input);
      return this.buildSummary(workspaceId, from, to);
    }
    const context = await authorization.require(userId, 'dashboard.view');
    const { from, to } = dashboardDateRange(input);
    const access = dashboardReadAccess(
      context.featureIds,
      context.permissionKeys,
    );
    const summary = await this.buildSummary(
      context.workspaceId,
      from,
      to,
      access,
    );
    return filterDashboardSurface(summary, access, context.featureIds);
  }

  async summaryForWorkspace(workspaceId: string) {
    const { from, to } = dashboardDateRange();
    return this.buildSummary(workspaceId, from, to);
  }

  private async buildSummary(
    workspaceId: string,
    from: Date,
    to: Date,
    access?: DashboardReadAccess,
  ) {
    const {
      workspace,
      periodTransactions,
      periodCampaigns: periodCampaignsRaw,
      channels,
      members,
      periodInvestments,
      accountRows: nativeAccountRows,
      campaignStatusCounts,
      campaignsCount,
      hypothesisStatusCounts,
      totalInvestedPrimary,
      operatingProfitAllTime,
      cumulativeBeforePeriod,
      revenueByChannel,
    } = access
      ? await this.reads.load(workspaceId, from, to, access)
      : await this.reads.load(workspaceId, from, to);

    const periodRevenueTransactions = periodTransactions.filter(
      (transaction) =>
        dashboardCategoryKey(transaction) === 'channel_advertising_revenue',
    );
    const periodExpenseTransactions = periodTransactions.filter(
      (transaction) => transaction.type === 'expense',
    );
    const campaignDate = (campaign: DatedDashboardCampaign) =>
      campaign.placementDate ?? campaign.startedAt ?? campaign.createdAt;

    const income = periodRevenueTransactions.reduce(
      (a, t) => a + dec(t.amountInPrimaryCurrency),
      0,
    );
    const expenses = periodExpenseTransactions.reduce(
      (a, t) => a + dec(t.amountInPrimaryCurrency),
      0,
    );
    const investedForPeriod = periodInvestments.reduce(
      (sum, investment) => sum + dec(investment.amountInPrimaryCurrency),
      0,
    );
    const remainingToBreakEven = Math.max(
      0,
      totalInvestedPrimary - operatingProfitAllTime,
    );
    const periodDays = dashboardPeriodDays(from, to);
    const projectedMonthlyProfit = ((income - expenses) / periodDays) * 30;
    const projectedPaybackMonths =
      projectedMonthlyProfit > 0
        ? remainingToBreakEven / projectedMonthlyProfit
        : null;
    const adSpend = periodCampaignsRaw.reduce(
      (a, c) => a + dec(c.priceInPrimaryCurrency),
      0,
    );
    const selectedInviteLinkIds = periodCampaignsRaw
      .map((campaign) => String(campaign.telegramInviteLinkId || '').trim())
      .filter(Boolean);
    const selectedInviteLinks = await this.reads.loadSelectedInviteLinks(
      workspaceId,
      selectedInviteLinkIds,
    );
    const selectedInviteLinksById = new Map(
      selectedInviteLinks.map((link) => [
        link.id,
        inviteLinkJoinedSubscribers(link),
      ]),
    );
    const campaignJoinedCount = (campaign: DashboardCampaign) => {
      const selectedLinkId = String(campaign.telegramInviteLinkId || '').trim();
      if (selectedLinkId && selectedInviteLinksById.has(selectedLinkId)) {
        return Number(selectedInviteLinksById.get(selectedLinkId) || 0);
      }

      const linkedJoined = sumInviteLinkJoinedSubscribers(campaign.inviteLinks);
      return Math.max(Number(campaign.joinedCount || 0), linkedJoined);
    };
    let preparedRateSource: Promise<PreparedCurrencyRateSource> | undefined;
    const convertCurrency = async (
      amount: number,
      fromCurrency: string,
      toCurrency: string,
    ) => {
      if (fromCurrency === toCurrency) return amount;
      preparedRateSource ??=
        this.conversionService.prepareRateSource(workspaceId);
      return (await preparedRateSource).convertCurrency(
        amount,
        fromCurrency,
        toCurrency,
      );
    };
    const campaignsWithMtprotoMetrics = await Promise.all(
      periodCampaignsRaw.map(async (campaign) => {
        const joinedCount = campaignJoinedCount(campaign);
        const attributedCount = Math.max(
          joinedCount,
          sumInviteLinkAttributedSubscribers(campaign.inviteLinks),
        );
        const cpa =
          attributedCount > 0
            ? dec(campaign.priceInPrimaryCurrency) / attributedCount
            : null;
        const campaignCurrency = String(campaign.currency || '').toUpperCase();
        const kpiCurrency = String(
          campaign.telegramChannel?.kpiCurrency || campaignCurrency,
        ).toUpperCase();
        const nativeCost = dec(campaign.price);
        const costInKpiCurrency =
          campaignCurrency === kpiCurrency
            ? nativeCost
            : await convertCurrency(nativeCost, campaignCurrency, kpiCurrency);
        const cpaInKpiCurrency =
          costInKpiCurrency != null && attributedCount > 0
            ? costInKpiCurrency / attributedCount
            : null;
        return {
          ...campaign,
          joinedCount,
          attributedCount,
          leftCount: null,
          netGrowthCount: null,
          cpa,
          overallStatus: resolveChannelKpiStatus({
            avgCpa: cpaInKpiCurrency,
            targetCpaFrom: campaign.telegramChannel?.targetCpaFrom,
            targetCpa: campaign.telegramChannel?.targetCpa,
            acceptableCpaFrom: campaign.telegramChannel?.acceptableCpaFrom,
            acceptableCpa: campaign.telegramChannel?.acceptableCpa,
            stopCpaFrom: campaign.telegramChannel?.stopCpaFrom,
            stopCpa: campaign.telegramChannel?.stopCpa,
          }),
          attributionSource: 'mtproto_invite_link_usage',
        };
      }),
    );
    const periodCampaigns = campaignsWithMtprotoMetrics;
    const totalJoined = periodCampaigns.reduce(
      (sum, campaign) => sum + campaign.joinedCount,
      0,
    );
    const cpas = periodCampaigns.map((c) => dec(c.cpa)).filter((x) => x > 0);
    const rankedCampaigns = periodCampaigns.filter(
      (campaign) =>
        campaign.joinedCount > 0 &&
        dec(campaign.priceInPrimaryCurrency) > 0 &&
        campaign.cpa !== null,
    );

    const accountRows = await Promise.all(
      nativeAccountRows.map(async ({ account, balance }) => {
        const primary = await convertCurrency(
          balance,
          account.currency,
          workspace.primaryCurrency,
        );
        const secondary = await convertCurrency(
          balance,
          account.currency,
          workspace.secondaryCurrency,
        );
        return { account, balance, primary, secondary };
      }),
    );

    const totalBalancePrimary = accountRows.reduce(
      (a, row) => a + dec(row.primary),
      0,
    );
    const totalBalanceSecondary = accountRows.reduce(
      (a, row) => a + dec(row.secondary),
      0,
    );

    const dailyTrend = buildDashboardTrend({
      from,
      to,
      cumulativeBeforePeriod,
      revenue: periodRevenueTransactions,
      expenses: periodExpenseTransactions,
      investments: periodInvestments,
      campaigns: periodCampaigns.map((campaign) => ({
        date: campaignDate(campaign),
        priceInPrimaryCurrency: campaign.priceInPrimaryCurrency,
        joinedCount: campaign.joinedCount,
      })),
    });

    const categoryMap = new Map<
      string,
      {
        id?: string | null;
        name: string;
        type: string;
        amount: number;
        count: number;
        iconId?: string | null;
        icon?: Parameters<typeof iconToResolvedEmoji>[0] | null;
      }
    >();
    for (const transaction of [
      ...periodRevenueTransactions,
      ...periodExpenseTransactions,
    ]) {
      const category = transaction.categoryRef;
      const key = `${transaction.type}:${transaction.categoryId ?? transaction.category}`;
      const current = categoryMap.get(key) ?? {
        id: transaction.categoryId,
        name: category?.name ?? transaction.category,
        type: transaction.type,
        amount: 0,
        count: 0,
        iconId: category?.iconId ?? null,
        icon: category?.icon ?? null,
      };
      current.amount += dec(transaction.amountInPrimaryCurrency);
      current.count += 1;
      categoryMap.set(key, current);
    }

    const channelAdMap = new Map<
      string,
      {
        id: string;
        title: string;
        username?: string | null;
        photoUrl?: string | null;
        spend: number;
        joined: number;
        campaigns: number;
      }
    >();
    for (const campaign of periodCampaigns) {
      const channel = campaign.telegramChannel;
      const current = channelAdMap.get(channel.id) ?? {
        id: channel.id,
        title: channel.title,
        username: channel.username,
        photoUrl: channel.photoUrl,
        spend: 0,
        joined: 0,
        campaigns: 0,
      };
      current.spend += dec(campaign.priceInPrimaryCurrency);
      current.joined += campaign.joinedCount;
      current.campaigns += 1;
      channelAdMap.set(channel.id, current);
    }

    const revenueByChannelId = new Map<
      string,
      { allTimeRevenue: number; periodRevenue: number }
    >(
      [...revenueByChannel].map(([channelId, allTimeRevenue]) => [
        channelId,
        { allTimeRevenue, periodRevenue: 0 },
      ]),
    );
    for (const transaction of periodRevenueTransactions) {
      const channelId = transaction.telegramChannelId;
      if (!channelId) continue;
      const current = revenueByChannelId.get(channelId) ?? {
        allTimeRevenue: 0,
        periodRevenue: 0,
      };
      current.periodRevenue += dec(transaction.amountInPrimaryCurrency);
      revenueByChannelId.set(channelId, current);
    }

    const ownChannels = channels.filter(
      (channel) => channel.adminLinks.length > 0,
    );
    const externalChannels = channels.filter(
      (channel) => channel.adminLinks.length === 0,
    );
    const totalSubscribers = ownChannels.reduce((sum, channel) => {
      const latest = channel.audienceSnapshots[0];
      return (
        sum +
        Number(latest?.subscribersCount ?? channel.currentSubscribersCount ?? 0)
      );
    }, 0);
    const activeSubscribersEstimate = ownChannels.reduce((sum, channel) => {
      const latest = channel.audienceSnapshots[0];
      return sum + Number(latest?.activeSubscribersEstimate ?? 0);
    }, 0);
    const anomalousChannelsCount = ownChannels.filter(
      (channel) => channel.audienceSnapshots[0]?.hasExternalTrafficAnomaly,
    ).length;
    const adQualityCounts = periodCampaigns.reduce<Record<string, number>>(
      (acc, campaign) => {
        const key = campaign.overallStatus || 'unknown';
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      },
      {},
    );
    return {
      period: {
        dateFrom: dashboardIsoDay(from),
        dateTo: dashboardIsoDay(to),
      },
      totalBalancePrimary,
      totalBalanceSecondary,
      primaryCurrency: workspace.primaryCurrency,
      secondaryCurrency: workspace.secondaryCurrency,
      incomeForPeriod: income,
      expensesForPeriod: expenses,
      profitForPeriod: income - expenses,
      investedCapital: totalInvestedPrimary,
      investedCapitalForPeriod: investedForPeriod,
      operatingProfitAllTime,
      remainingToBreakEven,
      projectedMonthlyProfit,
      projectedPaybackMonths,
      revenueTransactionsCount: periodRevenueTransactions.length,
      channelsWithRevenueCount: new Set(
        periodRevenueTransactions
          .map((transaction) => transaction.telegramChannelId)
          .filter(Boolean),
      ).size,
      adSpendForPeriod: adSpend,
      totalJoinedFromAds: totalJoined,
      averageCPA: cpas.length
        ? cpas.reduce((a, b) => a + b, 0) / cpas.length
        : null,
      campaignsCount,
      periodCampaignsCount: periodCampaigns.length,
      telegramChannelsCount: channels.length,
      ownChannelsCount: ownChannels.length,
      externalChannelsCount: externalChannels.length,
      workspaceMembersCount: members,
      totalSubscribers,
      activeSubscribersEstimate,
      anomalousChannelsCount,
      dailyTrend,
      categoryBreakdown: [...categoryMap.values()]
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 8)
        .map((row) => ({
          ...row,
          iconPresentation: iconToResolvedEmoji(row.icon),
        })),
      accountBalances: accountRows
        .map((row) => ({
          id: row.account.id,
          name: row.account.name,
          currency: row.account.currency,
          iconId: row.account.iconId,
          icon: row.account.icon,
          iconPresentation: iconToResolvedEmoji(row.account.icon),
          balance: row.balance,
          primary: row.primary,
          secondary: row.secondary,
        }))
        .sort((a, b) => dec(b.primary) - dec(a.primary)),
      channelPerformance: [...channelAdMap.values()]
        .map((channel) => {
          const revenue = revenueByChannelId.get(channel.id);
          const acquisitionCost = ownChannels.find(
            (ownChannel) => ownChannel.id === channel.id,
          )?.purchaseTransaction
            ? dec(
                ownChannels.find((ownChannel) => ownChannel.id === channel.id)
                  ?.purchaseTransaction?.amountInPrimaryCurrency,
              )
            : 0;
          const remaining = Math.max(
            0,
            acquisitionCost - dec(revenue?.allTimeRevenue),
          );
          const periodNet = dec(revenue?.periodRevenue) - channel.spend;
          const monthlyNet = (periodNet / periodDays) * 30;
          return {
            ...channel,
            revenue: dec(revenue?.periodRevenue),
            allTimeRevenue: dec(revenue?.allTimeRevenue),
            acquisitionCost,
            net: periodNet,
            remainingToBreakEven: remaining,
            projectedPaybackMonths:
              monthlyNet > 0 ? remaining / monthlyNet : null,
            cpa: channel.joined > 0 ? channel.spend / channel.joined : null,
          };
        })
        .sort((a, b) => dec(b.net) - dec(a.net))
        .slice(0, 6),
      topOwnChannels: ownChannels
        .map((channel) => {
          const latest = channel.audienceSnapshots[0];
          return {
            id: channel.id,
            title: channel.title,
            username: channel.username,
            photoUrl: channel.photoUrl,
            subscribers: Number(
              latest?.subscribersCount ?? channel.currentSubscribersCount ?? 0,
            ),
            activeSubscribers: Number(latest?.activeSubscribersEstimate ?? 0),
            viewRate: latest?.viewRate ?? null,
            dataQuality: latest?.dataQuality ?? 'unknown',
          };
        })
        .sort((a, b) => b.subscribers - a.subscribers)
        .slice(0, 6),
      campaignStatusCounts,
      adQualityCounts,
      hypothesisStatusCounts,
      bestCampaigns: [...rankedCampaigns]
        .sort((a, b) => dec(a.cpa) - dec(b.cpa))
        .slice(0, 5),
      worstCampaigns: [...rankedCampaigns]
        .sort((a, b) => dec(b.cpa) - dec(a.cpa))
        .slice(0, 5),
    };
  }
}
