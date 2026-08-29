import type { ResolvedEmoji } from "./resolved-emoji";
import type { TelegramAdPlacementStatus } from "./telegram-ad-sales-status";

export type TelegramAdAnalyticsDateField =
  | "saleCreatedAt"
  | "placementScheduledAt"
  | "placementPublishedAt"
  | "paymentPaidAt";

export type TelegramAdAnalyticsDateRule = {
  metric: string;
  dateField: TelegramAdAnalyticsDateField;
  description: string;
};

export type TelegramAdAnalyticsSeriesPoint = {
  date: string;
  agreedRevenue: string;
  paidRevenue: string;
  outstandingRevenue: string;
  placements: number;
  expectedViews: number;
  actualViews: number;
};

export type TelegramAdPricingSeriesPoint = {
  date: string;
  channelId: string;
  productId: string | null;
  expectedViews: number;
  recommendedPrice: string;
  minimumPrice: string;
  targetCpm: string;
  minimumCpm: string | null;
  sampleCount: number;
  methodVersion: string;
};

export type TelegramAdInventorySeriesPoint = {
  date: string;
  channelId: string;
  eligibleSlots: number;
  availableSlots: number;
  reservedSlots: number;
  soldSlots: number;
  publishedSlots: number;
  blockedSlots: number;
  pastUnusedSlots: number;
  bookingFillRate: number;
  publishedFillRate: number;
};

export type TelegramAdAnalyticsAlert = {
  kind:
    | "OVERDUE_PAYMENT"
    | "MISSED_PLACEMENT"
    | "DELETION_FAILURE"
    | "UNDERPRICED_PLACEMENT"
    | "UNUSED_INVENTORY";
  severity: "info" | "warn" | "error";
  channelId: string | null;
  saleId: string | null;
  placementId: string | null;
  title: string;
  details: string;
  scheduledAt: string | null;
  amount: string | null;
  currency: string | null;
};

export type TelegramAdAnalyticsSummaryResponse = {
  dateFrom: string;
  dateTo: string;
  timezone: string;
  currency?: string | null;
  revenueThisMonth: string;
  revenuePreviousMonth: string;
  monthOverMonthChangePercent: number | null;
  paidRevenue: string;
  accountsReceivable: string;
  upcomingPlacements: number;
  availableSlotsNext7Days: number;
  slotFillRate: number;
  averageCpm: string;
  underpricingLoss: string;
  bestChannelByRevenue: {
    channelId: string;
    title: string;
    value: string;
  } | null;
  bestChannelByActualCpm: {
    channelId: string;
    title: string;
    value: string;
  } | null;
  channelWithMostUnusedInventory: {
    channelId: string;
    title: string;
    unusedSlots: number;
  } | null;
  paymentOverdueCount: number;
  deletionFailuresCount: number;
};

export type TelegramAdAnalyticsOverviewResponse = {
  summary: TelegramAdAnalyticsSummaryResponse;
  revenueSeries: TelegramAdRevenueSeriesResponse;
  inventory: TelegramAdInventoryAnalyticsResponse;
  alerts: TelegramAdAnalyticsAlertsResponse;
  channels: TelegramAdChannelAnalyticsResponse[];
};

export type TelegramAdChannelAnalyticsResponse = {
  channelId: string;
  title: string;
  iconPresentation?: ResolvedEmoji | null;
  dateFrom: string;
  dateTo: string;
  timezone: string;
  dateRules: TelegramAdAnalyticsDateRule[];
  revenue: {
    currency?: string | null;
    totalAgreedRevenue: string;
    totalPaidRevenue: string;
    totalRevenueInPrimaryCurrency: string;
    periodRevenue: string;
    outstandingRevenue: string;
    refundedRevenue: string;
    averageSalePrice: string;
    medianSalePrice: string;
    elapsedMinimumRevenue: string;
    elapsedSoldRevenue: string;
    elapsedRevenueGap: string;
  };
  placements: {
    sold: number;
    published: number;
    completed: number;
    cancelled: number;
    slotsEligible: number;
    slotsAvailable: number;
    slotsReserved: number;
    slotFillRate: number;
    bookingFillRate: number;
    publishedFillRate: number;
    cancellationRate: number;
  };
  pricing: {
    currentExpectedViews: number;
    currentRecommendedPrice: string;
    currentMinimumPrice: string;
    averageAgreedPrice: string;
    averageDiscountFromRecommendedPercent: number;
    underpricingAmount: string;
    underpricingPercent: number;
    lostPotentialRevenue: string;
  };
  performance: {
    expectedViews: number;
    actualViews24h: number;
    actualViews48h: number;
    actualViewsFinal: number;
    expectedCpm: string;
    actualCpm: string;
    varianceExpectedVsActualPercent: number;
  };
  operations: {
    upcomingPlacements: number;
    upcomingDeletions: number;
    overdueUnpaidSales: number;
    missedPlacements: number;
    deletionFailures: number;
  };
  recentSales: Array<{
    saleId: string;
    placementId: string;
    advertiserName: string;
    scheduledAt: string;
    agreedPrice: string;
    paidAllocatedAmount: string;
    status: TelegramAdPlacementStatus;
    currency: string;
  }>;
};

export type TelegramAdNetworkAnalyticsResponse = {
  networkId: string;
  name: string;
  mode: "ATTRIBUTED_ONLY" | "ALL_CURRENT_CHANNELS";
  dateFrom: string;
  dateTo: string;
  timezone: string;
  totalRevenue: string;
  paidRevenue: string;
  outstandingRevenue: string;
  placementsCount: number;
  fillRate: number;
  expectedViews: number;
  actualViews: number;
  blendedExpectedCpm: string;
  blendedActualCpm: string;
  underpricingLoss: string;
  channels: Array<{
    channelId: string;
    title: string;
    revenue: string;
    revenueSharePercent: number;
    placementsCount: number;
    fillRate: number;
    nextAvailableSlotAt: string | null;
  }>;
};

export type TelegramAdAnalyticsAlertsResponse = {
  dateFrom: string;
  dateTo: string;
  timezone: string;
  items: TelegramAdAnalyticsAlert[];
};

export type TelegramAdRevenueSeriesResponse = {
  dateFrom: string;
  dateTo: string;
  timezone: string;
  granularity: "day" | "week" | "month";
  points: TelegramAdAnalyticsSeriesPoint[];
};

export type TelegramAdPricingSeriesResponse = {
  dateFrom: string;
  dateTo: string;
  timezone: string;
  granularity: "day" | "week" | "month";
  points: TelegramAdPricingSeriesPoint[];
};

export type TelegramAdInventoryAnalyticsResponse = {
  dateFrom: string;
  dateTo: string;
  timezone: string;
  points: TelegramAdInventorySeriesPoint[];
};
