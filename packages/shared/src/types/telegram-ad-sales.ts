import type { PaginatedResponse } from "../pagination";
import type { ResolvedEmoji } from "./resolved-emoji";
import type { TelegramAdPlacementStatus } from "./telegram-ad-sales-status";
import type { TelegramPostButtonRows } from "./telegram-post-buttons";

export type { TelegramAdPlacementStatus } from "./telegram-ad-sales-status";

export type TelegramAdPricingMode = "CPM" | "FIXED" | "MANUAL";

export type TelegramAdSlotStrategy =
  | "BEFORE_ORGANIC_POST"
  | "FIXED_TIMES"
  | "MANUAL";

export type TelegramAdSaleStatus =
  | "DRAFT"
  | "RESERVED"
  | "CONFIRMED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export type TelegramAdSaleOrigin =
  | "DIRECT"
  | "REPEAT"
  | "ADSELL_IO"
  | "COLLABORATOR_PRO";

export type TelegramAdSalePaymentStatus = "ACTIVE" | "VOIDED";

export type TelegramAdvertiserStatus =
  | "LEAD"
  | "ACTIVE"
  | "INACTIVE"
  | "LOST"
  | "BLOCKED"
  | "ARCHIVED";

export type TelegramAdvertiserLifecycleStage =
  | "NEW"
  | "CONTACTED"
  | "QUALIFIED"
  | "CUSTOMER"
  | "REPEAT_CUSTOMER"
  | "REACTIVATION"
  | "CHURNED";

export type TelegramAdvertiserContactType =
  | "TELEGRAM_USERNAME"
  | "TELEGRAM_USER_ID"
  | "PHONE"
  | "EMAIL"
  | "WEBSITE"
  | "OTHER";

export type TelegramAdCrmDealStage =
  | "NEW_LEAD"
  | "CONTACTED"
  | "NEED_IDENTIFIED"
  | "OFFER_PREPARED"
  | "OFFER_SENT"
  | "NEGOTIATION"
  | "SLOT_RESERVED"
  | "WAITING_PAYMENT"
  | "PAID"
  | "SCHEDULED"
  | "PUBLISHED"
  | "COMPLETED"
  | "LOST";

export type TelegramAdvertiserActivityType =
  | "ADVERTISER_CREATED"
  | "CONTACT_ADDED"
  | "NOTE_ADDED"
  | "MANUAL_CONTACT"
  | "OUTREACH_PLANNED"
  | "OUTREACH_COMPLETED"
  | "CLIENT_REPLIED"
  | "OFFER_SENT"
  | "SALE_CREATED"
  | "SALE_STAGE_CHANGED"
  | "SLOT_RESERVED"
  | "PAYMENT_RECORDED"
  | "PLACEMENT_SCHEDULED"
  | "PLACEMENT_PUBLISHED"
  | "PLACEMENT_COMPLETED"
  | "FOLLOW_UP_CREATED"
  | "FOLLOW_UP_COMPLETED"
  | "FOLLOW_UP_SKIPPED"
  | "CLIENT_DECLINED"
  | "CLIENT_REQUESTED_LATER_CONTACT"
  | "CLIENT_REACTIVATED"
  | "ADVERTISER_MERGED"
  | "OWNER_CHANGED"
  | "STATUS_CHANGED";

export type TelegramAdvertiserTaskType =
  | "FOLLOW_UP"
  | "PAYMENT_FOLLOW_UP"
  | "REQUEST_FEEDBACK"
  | "OFFER_FREE_SLOT"
  | "REACTIVATION"
  | "PREPARE_OFFER"
  | "MANUAL";

export type TelegramAdvertiserTaskStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "SKIPPED"
  | "CANCELLED";

export type TelegramAdvertiserTaskPriority =
  | "LOW"
  | "NORMAL"
  | "HIGH"
  | "URGENT";

export type TelegramAdSaleComputedPaymentStatus =
  | "UNPAID"
  | "PARTIALLY_PAID"
  | "PAID"
  | "OVERPAID";

export type TelegramAdAvailabilityState =
  | "AVAILABLE"
  | "RESERVED"
  | "SOLD"
  | "BLOCKED_BY_POLICY"
  | "CONFLICT_WITH_ORGANIC_POST"
  | "CONFLICT_WITH_AD"
  | "MANUAL_ONLY"
  | "PAST";

export type TelegramAdWarningCode =
  | "UNDER_MINIMUM_PRICE"
  | "LOW_DATA_QUALITY"
  | "FALLBACK_EXPECTED_VIEWS"
  | "INSUFFICIENT_POSTS_SAMPLE"
  | "NOT_ENOUGH_DATA"
  | "MANUAL_SLOT_ONLY";

export type TelegramAdStructuredWarning = {
  code: TelegramAdWarningCode;
  message: string;
  details?: Record<string, unknown> | null;
};

export type TelegramAdStructuredErrorCode = "AD_SLOT_CONFLICT";

export type TelegramAdStructuredError = {
  code: TelegramAdStructuredErrorCode;
  message: string;
  details: Record<string, unknown>;
};

export type TelegramAdProduct = {
  id: string;
  workspaceId: string;
  telegramChannelId: string;
  name: string;
  description: string | null;
  topDurationMinutes: number | null;
  feedDurationHours: number | null;
  deleteAfterHours: number | null;
  isPermanent: boolean;
  defaultPricingMode: TelegramAdPricingMode;
  defaultCpm: string | null;
  defaultFixedPrice: string | null;
  minimumPrice: string | null;
  currency: string;
  isActive: boolean;
  position: number;
  pricingWindowHours?: number | null;
  pricingWindowLabel?: string | null;
  estimatedViews?: number | null;
  estimatedPrice?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TelegramAdChannelPricingSettings = {
  channelId: string;
  baseCpm: string | null;
  currency: string;
  updatedAt?: string | null;
};

export type TelegramAdSchedulePolicy = {
  id: string;
  workspaceId: string;
  telegramChannelId: string;
  timezone: string;
  autoFrequencyEnabled: boolean;
  expectedOrganicPostsPerDay: string | null;
  useWorkspaceDefault: boolean;
  organicPostsPerAdSlot: number;
  maxAdsPerDay: number;
  minHoursBetweenAds: number;
  minDaysBetweenAds: number;
  slotStrategy: TelegramAdSlotStrategy;
  fallbackSlotTimes: string[];
  allowManualSlots: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TelegramAdSalesWorkspaceSettings = {
  workspaceId: string;
  defaultOrganicPostsPerAdSlot: number;
  createdAt: string;
  updatedAt: string;
};

export type TelegramAdSalesMemberPreferences = {
  id: string;
  workspaceId: string;
  workspaceMemberId: string;
  selectedChannelIds: string[];
  selectedNetworkId: string | null;
  calendarView: "week" | "month" | "list";
  initialized: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TelegramAdPriceSnapshot = {
  id: string;
  workspaceId: string;
  telegramChannelId: string;
  telegramAdProductId: string | null;
  calculatedAt: string;
  source: string;
  methodVersion: string;
  statisticsWindowDays: number;
  postsSampleCount: number;
  expectedViews: number;
  averageViews: string | null;
  medianViews: string | null;
  adjustedViews: string | null;
  targetCpm: string;
  minimumCpm: string | null;
  recommendedPrice: string;
  minimumPrice: string;
  currency: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type TelegramAdPriceQuote = {
  snapshotId: string | null;
  expectedViews: number | null;
  targetCpm: string;
  recommendedPrice: string;
  minimumPrice: string;
  currency: string;
  dataQuality: string;
  warnings: TelegramAdStructuredWarning[];
};

export type TelegramAdChannelBaseline = {
  channelId: string;
  expectedViews: number | null;
  averageViews: number | null;
  medianViews: number | null;
  adjustedViews: number | null;
  postsSampleCount: number;
  methodVersion: string;
  dataQuality: "READY" | "NOT_ENOUGH_DATA";
  warnings: string[];
  fallbackSource: "POSTS" | "NONE";
  sample: Array<{
    postId: string | null;
    date: string;
    rawViews: number | null;
    included: boolean;
    reason: string | null;
  }>;
  pricing: TelegramAdChannelPricingSettings;
  windows: {
    final: {
      expectedViews: number | null;
      averageViews: number | null;
      medianViews: number | null;
      postsSampleCount: number;
      dataQuality: "READY" | "NOT_ENOUGH_DATA";
    };
    h24: {
      expectedViews: number | null;
      averageViews: number | null;
      medianViews: number | null;
      postsSampleCount: number;
      dataQuality: "READY" | "NOT_ENOUGH_DATA";
    };
    h48: {
      expectedViews: number | null;
      averageViews: number | null;
      medianViews: number | null;
      postsSampleCount: number;
      dataQuality: "READY" | "NOT_ENOUGH_DATA";
    };
    h72: {
      expectedViews: number | null;
      averageViews: number | null;
      medianViews: number | null;
      postsSampleCount: number;
      dataQuality: "READY" | "NOT_ENOUGH_DATA";
    };
    d7: {
      expectedViews: number | null;
      averageViews: number | null;
      medianViews: number | null;
      postsSampleCount: number;
      dataQuality: "READY" | "NOT_ENOUGH_DATA";
    };
  };
};

export type TelegramAdChannelSetup = {
  baseline: TelegramAdChannelBaseline;
  policy: TelegramAdSchedulePolicy;
  products: TelegramAdProduct[];
};

export type TelegramAdAvailabilitySlot = {
  channelId: string;
  date: string;
  inventoryOpportunityKey?: string | null;
  scheduledAt: string;
  timezone: string;
  source: string;
  state: TelegramAdAvailabilityState;
  blockingReason: string | null;
  nextOrganicPostAt: string | null;
  productId: string | null;
  expectedViews: number;
  recommendedPrice: string;
  minimumPrice: string;
  currency: string;
  existingPlacement: {
    id: string;
    saleId: string;
    status: TelegramAdPlacementStatus;
    scheduledAt?: string;
    title?: string | null;
    advertiserName?: string | null;
    saleStatus?: TelegramAdSaleStatus | null;
    paymentStatus?: TelegramAdSaleComputedPaymentStatus | null;
    agreedPrice?: string;
    currency?: string;
    viewsCount?: number | null;
  } | null;
  organicPostsCountForDay: number;
  adsCountForDay: number;
};

export type TelegramAdAvailabilityDaySummary = {
  channelId: string;
  date: string;
  timezone: string;
  organicPostsCountForDay: number;
  adsCountForDay: number;
};

export type TelegramAdAvailabilityResponse = {
  from: string;
  to: string;
  slots: TelegramAdAvailabilitySlot[];
  summaries: TelegramAdAvailabilityDaySummary[];
  warnings: TelegramAdStructuredWarning[];
};

export type TelegramAdSalePlacement = {
  id: string;
  workspaceId: string;
  telegramAdSaleId: string;
  telegramChannelId: string;
  telegramChannelNetworkId: string | null;
  telegramAdProductId: string | null;
  inventoryOpportunityKey: string | null;
  pricingSnapshotId: string | null;
  status: TelegramAdPlacementStatus;
  scheduledAt: string;
  timezone: string;
  pricingMode: TelegramAdPricingMode;
  expectedViews: number;
  quotedCpm: string | null;
  recommendedPrice: string;
  minimumPrice: string;
  agreedPrice: string;
  currency: string;
  scheduledManagedAt?: string | null;
  topDurationMinutesSnapshot: number | null;
  feedDurationHoursSnapshot: number | null;
  deleteAfterHoursSnapshot: number | null;
  isPermanentSnapshot: boolean;
  manualPriceReason: string | null;
  managedPostId: string | null;
  managedPost?: {
    id: string;
    title: string;
    text: string | null;
    imageUrls: string[];
    buttonRows: TelegramPostButtonRows;
    sourceType?: "MTPROTO" | "BOT" | null;
    status: string;
    telegramRemoteStatus: string;
    telegramMessageIds: string[];
    telegramMessageUrls: string[];
    publishedAt: string | null;
    scheduledAt: string | null;
    lastError: string | null;
  } | null;
  telegramPostId: string | null;
  telegramPostUrl?: string | null;
  telegramPost?: {
    id: string;
    telegramMessageId: string;
    viewsCount: number | null;
    forwardsCount: number | null;
    reactionsCount: number | null;
    commentsCount: number | null;
    postDate: string;
  } | null;
  publishedAt: string | null;
  plannedDeleteAt: string | null;
  deletedAt: string | null;
  lastDeletionAttemptAt?: string | null;
  lastDeletionError?: string | null;
  actualViews24h: number | null;
  actualViews48h: number | null;
  actualViewsFinal: number | null;
  actualReactionsFinal: number | null;
  actualCpm: string | null;
  completedAt?: string | null;
  paidAllocatedAmount?: string | null;
  unpaidAmount?: string | null;
  underpricingAmount?: string | null;
  underpricingPercent?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TelegramAdSalePaymentAllocation = {
  id: string;
  workspaceId: string;
  telegramAdSalePaymentId: string;
  telegramAdSalePlacementId: string;
  amount: string;
  currency: string;
  amountInPrimaryCurrency: string;
  createdAt: string;
};

export type TelegramAdSalePayment = {
  id: string;
  workspaceId: string;
  telegramAdSaleId: string;
  accountId: string;
  transactionId: string | null;
  amount: string;
  currency: string;
  amountInPrimaryCurrency: string;
  exchangeRateToPrimary: string;
  paidAt: string;
  notes: string | null;
  status: TelegramAdSalePaymentStatus;
  idempotencyKey?: string | null;
  reversalTransactionId?: string | null;
  voidedAt?: string | null;
  voidReason?: string | null;
  createdByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
  allocations: TelegramAdSalePaymentAllocation[];
};

export type TelegramAdSaleChannelBreakdown = {
  placementId: string;
  channelId: string;
  agreedPrice: string | null;
  paidAllocatedAmount: string | null;
  unpaidAmount: string | null;
  recommendedPrice: string | null;
  minimumPrice: string | null;
  underpricingAmount: string | null;
  underpricingPercent: string | null;
  status: TelegramAdPlacementStatus;
};

export type TelegramAdSale = {
  id: string;
  workspaceId: string;
  advertiserId: string | null;
  advertiserName: string;
  advertiserTelegram: string | null;
  advertiserContact: string | null;
  advertiserNameSnapshot?: string | null;
  advertiserTelegramSnapshot?: string | null;
  advertiserCompanySnapshot?: string | null;
  title: string | null;
  notes: string | null;
  status: TelegramAdSaleStatus;
  origin: TelegramAdSaleOrigin;
  crmDealStage: TelegramAdCrmDealStage;
  expectedCloseAt: string | null;
  lostReason: string | null;
  nextActionAt: string | null;
  settlementCurrency: string;
  reservedUntil: string | null;
  financeSkipped: boolean;
  sourceTaskId?: string | null;
  sourceAdvertiserActivityId?: string | null;
  createdByUserId: string | null;
  assignedMemberId: string | null;
  assignedMember?: {
    id: string;
    name: string;
    email: string | null;
    avatarPresentation: ResolvedEmoji | null;
  } | null;
  createdAt: string;
  updatedAt: string;
  placements: TelegramAdSalePlacement[];
  payments?: TelegramAdSalePayment[];
  placementsCount?: number;
  totalAgreedAmount?: string | null;
  totalRecommendedAmount?: string | null;
  totalMinimumAmount?: string | null;
  totalPaidAmount?: string | null;
  outstandingAmount?: string | null;
  overpaidAmount?: string | null;
  paymentStatus?: TelegramAdSaleComputedPaymentStatus;
  totalAmountInPrimaryCurrency?: string | null;
  channelBreakdown?: TelegramAdSaleChannelBreakdown[];
  advertiser?: TelegramAdvertiser | null;
};

export type TelegramAdvertiserContact = {
  id: string;
  workspaceId: string;
  advertiserId: string;
  type: TelegramAdvertiserContactType;
  value: string;
  normalizedValue: string;
  label: string | null;
  isPrimary: boolean;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TelegramAdvertiserActivity = {
  id: string;
  workspaceId: string;
  advertiserId: string;
  saleId: string | null;
  placementId: string | null;
  taskId: string | null;
  actorUserId: string | null;
  actorMemberId: string | null;
  type: TelegramAdvertiserActivityType;
  title: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  occurredAt: string;
  createdAt: string;
};

export type TelegramAdvertiserTask = {
  id: string;
  workspaceId: string;
  advertiserId: string;
  saleId: string | null;
  placementId: string | null;
  assignedMemberId: string;
  createdByUserId: string | null;
  type: TelegramAdvertiserTaskType;
  status: TelegramAdvertiserTaskStatus;
  priority: TelegramAdvertiserTaskPriority;
  title: string;
  description: string | null;
  dueAt: string;
  remindAt: string | null;
  completedAt: string | null;
  skippedAt: string | null;
  snoozedUntil: string | null;
  completionNote: string | null;
  automationRuleId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export * from "./telegram-ad-sales-crm";
export type TelegramAdvertiser = {
  id: string;
  workspaceId: string;
  displayName: string;
  companyName: string | null;
  telegramUsername: string | null;
  telegramUserId: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  description: string | null;
  source: string | null;
  status: TelegramAdvertiserStatus;
  lifecycleStage: TelegramAdvertiserLifecycleStage;
  ownerMemberId: string | null;
  createdByUserId: string | null;
  lastContactAt: string | null;
  lastPurchaseAt: string | null;
  nextContactAt: string | null;
  defaultFollowUpDays: number | null;
  preferredCurrency: string | null;
  preferredContactMethod: TelegramAdvertiserContactType | null;
  totalSalesCount: number;
  completedSalesCount: number;
  totalPlacementsCount: number;
  totalRevenueInPrimaryCurrency: string;
  averageOrderValueInPrimaryCurrency: string;
  firstPurchaseAt: string | null;
  repeatCustomerAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  contacts?: TelegramAdvertiserContact[];
  recentActivities?: TelegramAdvertiserActivity[];
  openTasks?: TelegramAdvertiserTask[];
  sales?: TelegramAdSale[];
};

export type TelegramAdvertisersListResult =
  PaginatedResponse<TelegramAdvertiser>;

export * from "./telegram-ad-sales-analytics";
