import type { TelegramChannelAccessMode } from "../core";
import type { ResolvedEmoji } from "../core";
import type { TelegramChannelAdFormatPricing } from "./telegram-channel-analytics";

export type TelegramChannelNetworkKpiStatus =
  | "good"
  | "acceptable"
  | "bad"
  | "unknown";
export type TelegramChannelNetworkSummary = {
  currency?: string | null;
  channelsCount: number;
  totalSubscribers: number;
  pendingJoinRequestsCount?: number;
  activeSubscribersEstimate: number;
  paidActiveSubscribersEstimate: number;
  viewRate: number | null;
  reactionRate: number | null;
  totalAdSpend: number | null;
  campaignsCount: number;
  totalJoinedSubscribers: number;
  totalPendingSubscribers?: number;
  totalAttributedSubscribers?: number;
  avgCpa: number | null;
  activeCpa: number | null;
  kpiStatus: TelegramChannelNetworkKpiStatus;
  kpiLabel: string;
  assetEconomics?: TelegramChannelNetworkAssetEconomics;
};
export type TelegramChannelNetworkAssetEconomics = {
  currency: string | null;
  invested: number | null;
  purchasePrice: number | null;
  revenue: number | null;
  adSpend: number | null;
  remainingToBreakEven: number | null;
  paybackPercent: number | null;
  adsSold: number;
  estimatedAdPrice: number | null;
  estimatedAdsRemaining: number | null;
  conversionUnavailable: boolean;
  formatPricing?: {
    currency: string;
    cpm: number | null;
    h24: TelegramChannelAdFormatPricing;
    h48: TelegramChannelAdFormatPricing;
    h72: TelegramChannelAdFormatPricing;
    permanent: TelegramChannelAdFormatPricing;
  } | null;
};
export type TelegramChannelNetworkMember = {
  id: string;
  title: string;
  name?: string;
  username?: string | null;
  photoUrl?: string | null;
  accessMode?: TelegramChannelAccessMode;
  subscribersCount?: number | null;
  pendingJoinRequestsCount?: number | null;
  currentSubscribersCount?: number | null;
  activeSubscribersEstimate?: number | null;
};
export type TelegramChannelNetworkChannelSummary = {
  currency?: string | null;
  channelId: string;
  id: string;
  title: string;
  name?: string;
  username?: string | null;
  photoUrl?: string | null;
  subscribersCount?: number | null;
  pendingJoinRequestsCount?: number | null;
  currentSubscribersCount?: number | null;
  activeSubscribersEstimate?: number | null;
  paidActiveSubscribersEstimate?: number | null;
  viewRate?: number | null;
  reactionRate?: number | null;
  totalAdSpend: number | null;
  campaignsCount: number;
  totalJoinedSubscribers: number;
  totalPendingSubscribers?: number;
  totalAttributedSubscribers?: number;
  avgCpa: number | null;
  activeCpa: number | null;
  kpiStatus: TelegramChannelNetworkKpiStatus;
  kpiLabel?: string;
  assetEconomics?: TelegramChannelNetworkAssetEconomics;
};
export type TelegramChannelNetwork = {
  id: string;
  name: string;
  description?: string | null;
  iconId?: string | null;
  iconPresentation?: ResolvedEmoji | null;
  isSystem?: boolean;
  systemKey?: "ALL" | null;
  canEdit?: boolean;
  canDelete?: boolean;
  createdAt: string;
  updatedAt: string;
  channels: TelegramChannelNetworkMember[];
  summary: TelegramChannelNetworkSummary;
};
export type TelegramChannelNetworkDetail = TelegramChannelNetwork & {
  channelSummaries: TelegramChannelNetworkChannelSummary[];
};
export type CreateTelegramChannelNetworkPayload = {
  name: string;
  description?: string | null;
  iconId?: string | null;
  telegramChannelIds: string[];
};
export type UpdateTelegramChannelNetworkPayload = {
  name?: string;
  description?: string | null;
  iconId?: string | null;
  telegramChannelIds?: string[];
};
