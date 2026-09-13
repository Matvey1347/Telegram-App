import type { Currency, Icon, ResolvedEmoji } from "../core";
import type { TransactionType } from "../finance/finance";
import type { AdCampaign } from "../growth/ad-campaigns";

export type DashboardSummary = {
  period: { dateFrom: string; dateTo: string };
  totalBalancePrimary: number;
  totalBalanceSecondary: number;
  primaryCurrency?: Currency;
  secondaryCurrency?: Currency;
  incomeForPeriod: number;
  incomeBreakdownForPeriod: {
    channels: number;
    other: number;
  };
  excludedBalanceAdjustmentsForPeriod: number;
  revenuePerActiveSubscriber: number | null;
  expensesForPeriod: number;
  expensesBreakdownForPeriod: {
    channels: number;
    other: number;
  };
  profitForPeriod: number;
  investedCapital: number;
  investedCapitalForPeriod: number;
  investmentBreakdownForPeriod?: Array<{
    origin: "EXTERNAL" | "SALARY" | "REINVESTMENT";
    amount: number;
    movements: Array<{
      id: string;
      date: string;
      amountInPrimaryCurrency: number;
      amount: number;
      currency: Currency;
      movementType: "CONTRIBUTION" | "WITHDRAWAL";
      notes?: string | null;
      member: { id: string; name: string };
      account?: { id: string; name: string; currency: Currency } | null;
    }>;
  }>;
  operatingProfitAllTime: number;
  remainingToBreakEven: number;
  projectedMonthlyProfit: number;
  projectedPaybackMonths: number | null;
  revenueTransactionsCount: number;
  channelsWithRevenueCount: number;
  adSpendForPeriod: number;
  totalJoinedFromAds: number;
  averageCPA: number | null;
  campaignsCount: number;
  periodCampaignsCount: number;
  telegramChannelsCount: number;
  ownChannelsCount: number;
  externalChannelsCount: number;
  workspaceMembersCount: number;
  totalSubscribers: number;
  activeSubscribersEstimate: number;
  anomalousChannelsCount: number;
  dailyTrend: Array<{
    date: string;
    income: number;
    expenses: number;
    profit: number;
    investments: number;
    cumulativeProfitAfterInvestments: number;
    adSpend: number;
    joined: number;
  }>;
  categoryBreakdown: Array<{
    id?: string | null;
    name: string;
    type: TransactionType;
    flow: "income" | "expense" | "investment" | "adjustment";
    bucket: "channels" | "other";
    amount: number;
    count: number;
    excludedFromCashFlow: boolean;
    iconId?: string | null;
    icon?: Icon | null;
    iconPresentation?: ResolvedEmoji | null;
    transactions: Array<{
      id: string;
      description?: string | null;
      date: string;
      type: TransactionType;
      amount: number;
      currency: Currency;
      amountInPrimaryCurrency: number;
      iconPresentation?: ResolvedEmoji | null;
      account?: {
        id: string;
        name: string;
        currency: Currency;
        iconPresentation?: ResolvedEmoji | null;
      } | null;
      telegramChannel?: {
        id: string;
        title: string;
        photoUrl?: string | null;
      } | null;
    }>;
  }>;
  accountBalances: Array<{
    id: string;
    name: string;
    currency: Currency;
    iconId?: string | null;
    icon?: Icon | null;
    iconPresentation?: ResolvedEmoji | null;
    balance: number;
    primary: number;
    secondary: number;
  }>;
  channelPerformance: Array<{
    id: string;
    title: string;
    username?: string | null;
    photoUrl?: string | null;
    revenue: number;
    allTimeRevenue: number;
    spend: number;
    acquisitionCost: number;
    net: number;
    remainingToBreakEven: number;
    projectedPaybackMonths: number | null;
    joined: number;
    campaigns: number;
    cpa: number | null;
  }>;
  topOwnChannels: Array<{
    id: string;
    title: string;
    username?: string | null;
    photoUrl?: string | null;
    subscribers: number;
    activeSubscribers: number;
    viewRate?: number | null;
    dataQuality?: string | null;
  }>;
  campaignStatusCounts: Record<string, number>;
  adQualityCounts: Record<string, number>;
  hypothesisStatusCounts: Record<string, number>;
  bestCampaigns: AdCampaign[];
  worstCampaigns: AdCampaign[];
};
