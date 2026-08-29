import type { ResolvedEmoji } from '@telegram-system/shared';
import {
  iconToResolvedEmoji,
  type ResolvedEmojiIconSource,
} from '../../../common/icons/resolved-emoji';
import type { TelegramChannelFinancialPreviewInput } from '../telegram-channels/telegram-channel-financial-read.types';
import {
  aggregateChannelNetworkSummary,
  type ChannelNetworkSummaryInput,
} from './telegram-channel-network-summary';

type ChannelAudienceSnapshotInput = {
  subscribersCount?: number | null;
  activeSubscribersEstimate?: number | null;
  viewRate?: number | null;
  avgViewsAdjusted?: number | null;
  avgReactionsAdjusted?: number | null;
  dataQuality?: string | null;
  dataQualityReason?: string | null;
  hasExternalTrafficAnomaly?: boolean | null;
  hasSubscriberBasePollution?: boolean | null;
  postsWindow?: number | null;
};

export type ChannelNetworkChannelInput = Omit<
  TelegramChannelFinancialPreviewInput,
  'audienceSnapshots'
> & {
  title: string;
  username?: string | null;
  photoUrl?: string | null;
  pendingJoinRequestsCount?: number | null;
  audienceSnapshots?: ChannelAudienceSnapshotInput[];
};

export type ChannelNetworkAudience = {
  subscribersCount: number | null;
  activeSubscribersEstimate: number | null;
  paidActiveSubscribersEstimate: number | null;
  viewRate: number | null;
  avgViewsAdjusted: number | null;
  avgReactionsAdjusted: number | null;
  reactionRate: number | null;
  dataQuality: string | null;
  dataQualityReason: string | null;
  hasExternalTrafficAnomaly: boolean;
  hasSubscriberBasePollution: boolean;
  postsWindow: number | null | undefined;
  hasSnapshot: boolean;
};

type ChannelFinancialSummaryInput = ChannelNetworkSummaryInput & {
  currency: string | null;
  totalAdSpend: number | null;
  campaignsCount: number;
  totalJoinedSubscribers: number;
  totalPendingSubscribers: number;
  totalAttributedSubscribers: number;
  avgCpa: number | null;
  activeCpa: number | null;
  kpiLabel: string;
};

type ChannelNetworkInput = {
  id: string;
  workspaceId?: string;
  name: string;
  description?: string | null;
  iconId?: string | null;
  icon?: ResolvedEmojiIconSource | null;
  iconPresentation?: ResolvedEmoji | null;
  createdAt?: Date;
  updatedAt?: Date;
  assignedMemberId?: string | null;
  assignedMember?: unknown;
  createdByUserId?: string | null;
  createdByUser?: unknown;
  isSystem?: boolean;
  excludedTelegramChannelIds?: string[];
  channels: Array<{ telegramChannel: ChannelNetworkChannelInput }>;
};

export function audienceFromChannel(
  channel: ChannelNetworkChannelInput,
): ChannelNetworkAudience {
  const snapshot = channel.audienceSnapshots?.[0];
  const avgViewsAdjusted = snapshot?.avgViewsAdjusted ?? null;
  const avgReactionsAdjusted = snapshot?.avgReactionsAdjusted ?? null;
  return {
    subscribersCount:
      snapshot?.subscribersCount ?? channel.currentSubscribersCount ?? null,
    activeSubscribersEstimate: snapshot?.activeSubscribersEstimate ?? null,
    paidActiveSubscribersEstimate: snapshot?.activeSubscribersEstimate ?? null,
    viewRate: snapshot?.viewRate ?? null,
    avgViewsAdjusted,
    avgReactionsAdjusted,
    reactionRate:
      avgViewsAdjusted != null && avgViewsAdjusted > 0
        ? (Number(avgReactionsAdjusted || 0) / avgViewsAdjusted) * 100
        : null,
    dataQuality: snapshot?.dataQuality ?? null,
    dataQualityReason: snapshot?.dataQualityReason ?? null,
    hasExternalTrafficAnomaly: snapshot?.hasExternalTrafficAnomaly ?? false,
    hasSubscriberBasePollution: snapshot?.hasSubscriberBasePollution ?? false,
    postsWindow: snapshot?.postsWindow ?? channel.activeSubscribersWindow,
    hasSnapshot: Boolean(snapshot),
  };
}

export function channelNetworkFinancialSummary(
  channel: ChannelNetworkChannelInput,
  audience: ChannelNetworkAudience,
  finance: ChannelFinancialSummaryInput,
) {
  return {
    channelId: channel.id,
    id: channel.id,
    title: channel.title,
    name: channel.title,
    username: channel.username,
    photoUrl: channel.photoUrl,
    subscribersCount: audience.subscribersCount,
    currentSubscribersCount: channel.currentSubscribersCount,
    pendingJoinRequestsCount: channel.pendingJoinRequestsCount,
    activeSubscribersEstimate: audience.activeSubscribersEstimate,
    paidActiveSubscribersEstimate: audience.paidActiveSubscribersEstimate,
    viewRate: audience.viewRate,
    reactionRate: audience.reactionRate,
    avgViewsAdjusted: audience.avgViewsAdjusted,
    avgReactionsAdjusted: audience.avgReactionsAdjusted,
    currency: finance.currency,
    totalAdSpend: finance.totalAdSpend,
    campaignsCount: finance.campaignsCount,
    totalJoinedSubscribers: finance.totalJoinedSubscribers,
    totalPendingSubscribers: finance.totalPendingSubscribers,
    totalAttributedSubscribers: finance.totalAttributedSubscribers,
    avgCpa: finance.avgCpa,
    activeCpa: finance.activeCpa,
    kpiStatus: finance.kpiStatus,
    kpiLabel: finance.kpiLabel,
    assetEconomics: finance.assetEconomics,
  };
}

export function hasMeaningfulChannelData(
  channel: ChannelNetworkChannelInput,
  audience: ChannelNetworkAudience,
  financialSummary: Record<string, unknown> | undefined,
) {
  const finance = financialSummary as ChannelFinancialSummaryInput;
  const economics = finance.assetEconomics;
  return Boolean(
    channel.currentSubscribersCount != null ||
    Number(channel.pendingJoinRequestsCount || 0) > 0 ||
    audience.hasSnapshot ||
    Number(finance.campaignsCount || 0) > 0 ||
    Number(finance.totalAdSpend || 0) !== 0 ||
    Number(economics?.invested || 0) !== 0 ||
    Number(economics?.revenue || 0) !== 0 ||
    economics?.formatPricing?.permanent?.expectedViews != null,
  );
}

export function presentChannelNetwork(
  network: ChannelNetworkInput,
  audiences: ChannelNetworkAudience[],
  financialSummaries: ReadonlyMap<string, Record<string, unknown>>,
) {
  const channels = network.channels.map((member) => member.telegramChannel);
  const channelSummaries = channels.map((channel, index) =>
    channelNetworkFinancialSummary(
      channel,
      audiences[index],
      financialSummaries.get(channel.id) as ChannelFinancialSummaryInput,
    ),
  );
  return {
    id: network.id,
    name: network.name,
    description: network.description,
    iconId: network.iconId,
    iconPresentation:
      network.iconPresentation ?? iconToResolvedEmoji(network.icon),
    createdAt: network.createdAt,
    updatedAt: network.updatedAt,
    assignedMemberId: network.assignedMemberId,
    assignedMember: network.assignedMember,
    createdByUserId: network.createdByUserId,
    createdByUser: network.createdByUser,
    isSystem: Boolean(network.isSystem),
    systemKey: network.isSystem ? 'ALL' : null,
    canEdit: true,
    canDelete: !network.isSystem,
    excludedTelegramChannelIds: network.excludedTelegramChannelIds ?? undefined,
    channels: channelSummaries.map((channel) => ({
      id: channel.id,
      title: channel.title,
      name: channel.name,
      username: channel.username,
      photoUrl: channel.photoUrl,
      subscribersCount: channel.subscribersCount,
      pendingJoinRequestsCount: channel.pendingJoinRequestsCount,
      currentSubscribersCount: channel.currentSubscribersCount,
      activeSubscribersEstimate: channel.activeSubscribersEstimate,
    })),
    summary: aggregateChannelNetworkSummary(channelSummaries),
    channelSummaries,
  };
}
