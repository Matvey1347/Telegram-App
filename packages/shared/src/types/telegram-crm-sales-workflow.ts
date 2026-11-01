import type { CrmConversationState } from './telegram-crm';

export const CRM_MANUAL_SALES_STATUSES = ['INTERESTED', 'CLOSED', 'DO_NOT_CONTACT', 'HUMAN_REVIEW'] as const;
export type CrmManualSalesStatus = (typeof CRM_MANUAL_SALES_STATUSES)[number];
export type CrmSalesAttentionStatus = CrmManualSalesStatus | 'NEEDS_REPLY' | 'WAITING_FOR_CLIENT' | 'FOLLOW_UP_DUE';
export type CrmFollowUpSummary = {
  id: string;
  title: string;
  dueAt: string;
  remindAt: string | null;
  snoozedUntil: string | null;
  effectiveAt: string;
  assignedMemberId: string;
  status: 'OPEN' | 'IN_PROGRESS';
};
export type CrmSalesWorkflow = {
  conversationId: string;
  contactId: string | null;
  canEdit: boolean;
  manualStatus: CrmManualSalesStatus | null;
  attentionStatus: CrmSalesAttentionStatus | null;
  conversationState: CrmConversationState;
  nextFollowUp: CrmFollowUpSummary | null;
  nextContactAt: string | null;
  commercialOutreachAllowed: boolean;
  outreachBlockedReason: 'DO_NOT_CONTACT' | 'CLOSED' | 'INACTIVE' | 'UNLINKED' | null;
};
export type CrmSalesStatusInput = { manualStatus: CrmManualSalesStatus | null };
export type CrmScheduleFollowUpInput = { at: string; title?: string };
export type CrmFollowUpActionInput = { action: 'RESCHEDULE' | 'SNOOZE' | 'CANCEL' | 'COMPLETE'; at?: string };

export type CrmCurrencyAmount = { currency: string; amount: string };
export type CrmPurchaseSummary = {
  dealCount: number;
  purchaseCount: number;
  receivedByCurrency: CrmCurrencyAmount[];
  agreedByCurrency: CrmCurrencyAmount[];
  lastPurchaseAt: string | null;
  attribution: 'LINKED_SALES_ONLY';
};
export type CrmPurchasePlacement = {
  id: string;
  channel: { id: string; title: string };
  productName: string | null;
  networkName: string | null;
  agreedPrice: string;
  currency: string;
  status: string;
  scheduledAt: string;
};
export type CrmPurchaseItem = {
  id: string;
  title: string | null;
  status: string;
  dealStage: string;
  createdAt: string;
  settlementCurrency: string;
  agreedByCurrency: CrmCurrencyAmount[];
  receivedByCurrency: CrmCurrencyAmount[];
  placements: CrmPurchasePlacement[];
  hasMorePlacements: boolean;
  historicalDataIncomplete: boolean;
};
export type CrmPurchasesPage = {
  /** Returned only on the initial page; totals aggregate linked records without loading history. */
  summary: CrmPurchaseSummary | null;
  items: CrmPurchaseItem[];
  nextCursor: string | null;
  hasMore: boolean;
};
export type CrmPackageProduct = {
  id: string;
  name: string;
  channel: { id: string; title: string };
  pricingMode: string;
  fixedPrice: string | null;
  cpm: string | null;
  minimumPrice: string | null;
  currency: string;
  quoteRequired: boolean;
  topDurationMinutes: number | null;
  feedDurationHours: number | null;
  deleteAfterHours: number | null;
  isPermanent: boolean;
  updatedAt: string;
  constraints: {
    timezone: string;
    maxAdsPerDay: number;
    minHoursBetweenAds: number;
    minDaysBetweenAds: number;
    allowManualSlots: boolean;
  } | null;
};
export type CrmPackageNetwork = {
  id: string;
  name: string;
  channels: Array<{ id: string; title: string }>;
  channelsTruncated: boolean;
  updatedAt: string;
};
export type CrmPackageSalesContext = {
  asOf: string;
  discountPolicy: 'MANAGER_APPROVAL_REQUIRED';
  /** Networks describe current channel membership; no canonical flat package price exists. */
  networks: CrmPackageNetwork[];
  networksTruncated: boolean;
  products: CrmPackageProduct[];
  nextCursor: string | null;
  hasMore: boolean;
};

/** The same timestamp policy is used by server reads and realtime cache patches. */
export function deriveCrmSalesAttention(facts: {
  state: CrmConversationState;
  archivedAt?: string | null;
  manualStatus?: CrmManualSalesStatus | null;
  nextContactAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
}, now = Date.now()): CrmSalesAttentionStatus | null {
  if (facts.state !== 'ACTIVE' || facts.archivedAt) return null;
  if (facts.manualStatus) return facts.manualStatus;
  if (facts.nextContactAt && Date.parse(facts.nextContactAt) <= now) return 'FOLLOW_UP_DUE';
  if (facts.lastInboundAt && (!facts.lastOutboundAt || facts.lastInboundAt > facts.lastOutboundAt)) return 'NEEDS_REPLY';
  return facts.lastOutboundAt ? 'WAITING_FOR_CLIENT' : null;
}
