import {
  Prisma,
  TelegramAdPlacementStatus,
  TelegramAdSlotStrategy,
} from '@prisma/client';
import { decimalToString } from './domain/decimal';
import { utcDateKey, zonedDateTimeToUtc } from './domain/timezone';
import { AdSalesPricingPreview } from './telegram-ad-sales-pricing-reader';

export type AvailabilityChannel = {
  id: string;
  adBaseCurrency?: string | null;
  timePosts: Array<{ time: string }>;
};

export type AvailabilityPolicy = {
  timezone: string;
  expectedOrganicPostsPerDay?: Prisma.Decimal | number | null;
  organicPostsPerAdSlot: number;
  maxAdsPerDay: number;
  slotStrategy: TelegramAdSlotStrategy;
};

export type AvailabilityProduct = {
  id: string;
  telegramChannelId: string;
  topDurationMinutes: number | null;
  currency: string;
};

export type AvailabilityPlacement = {
  id: string;
  telegramAdSaleId: string;
  telegramChannelId: string;
  status: TelegramAdPlacementStatus;
  scheduledAt: Date;
  inventoryOpportunityKey: string | null;
  agreedPrice: Prisma.Decimal;
  currency: string;
  actualViewsFinal: number | null;
  actualViews48h: number | null;
  actualViews24h: number | null;
  telegramPost?: { viewsCount: number | null } | null;
  sale?: {
    title: string | null;
    advertiserName: string | null;
    advertiserNameSnapshot: string | null;
    status: unknown;
    paymentStatus?: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'OVERPAID' | null;
  } | null;
};

export type AvailabilityTelegramPost = {
  id: string;
  telegramChannelId: string;
  telegramMessageId: string;
  postDate: Date;
};

export type AvailabilityManagedPost = {
  id: string;
  telegramChannelId: string;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  telegramMessageIds: string[];
};

type AvailabilityBuildInput = {
  from: Date;
  to: Date;
  fromText: string;
  toText: string;
  historyFrom: Date;
  historyWindowDays: number;
  channels: AvailabilityChannel[];
  productsByChannel: Map<string, AvailabilityProduct[]>;
  policyByChannel: Map<string, AvailabilityPolicy>;
  pricingByChannel: Map<string, AdSalesPricingPreview>;
  placements: AvailabilityPlacement[];
  telegramPosts: AvailabilityTelegramPost[];
  managedOrganicPosts: AvailabilityManagedPost[];
  now?: Date;
};

function groupByChannel<T extends { telegramChannelId: string }>(items: T[]) {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const current = grouped.get(item.telegramChannelId) ?? [];
    current.push(item);
    grouped.set(item.telegramChannelId, current);
  }
  return grouped;
}

function projectedOrganicPostsPerDay(params: {
  channel: AvailabilityChannel;
  policy: AvailabilityPolicy;
  historicalOrganicPosts: number;
  historyWindowDays: number;
}) {
  const scheduledPerDay = params.channel.timePosts.length;
  if (scheduledPerDay > 0) return scheduledPerDay;
  const explicit = Number(params.policy.expectedOrganicPostsPerDay ?? 0);
  if (Number.isFinite(explicit) && explicit > 0) {
    return Math.max(1, Math.round(explicit));
  }
  if (params.historicalOrganicPosts <= 0 || params.historyWindowDays <= 0) {
    return 0;
  }
  return Math.max(
    1,
    Math.round(params.historicalOrganicPosts / params.historyWindowDays),
  );
}

function projectedOrganicTimeline(params: {
  dateKey: string;
  timezone: string;
  projectedCount: number;
  scheduledTimes: Array<{ time: string }>;
}) {
  const timeline: Array<{ id: string; at: Date }> = [];
  const fallbackTimes = ['09:00', '13:00', '17:00', '21:00'];
  for (let index = 0; index < params.projectedCount; index += 1) {
    const scheduledTime =
      params.scheduledTimes[index]?.time ??
      fallbackTimes[index] ??
      `${String((9 + index * 2) % 24).padStart(2, '0')}:00`;
    timeline.push({
      id: `projected:${params.dateKey}:${index}`,
      at: zonedDateTimeToUtc(params.dateKey, scheduledTime, params.timezone),
    });
  }
  return timeline;
}

export function buildAdSalesAvailability(input: AvailabilityBuildInput) {
  const now = input.now ?? new Date();
  const postsByChannel = groupByChannel(input.telegramPosts);
  const managedByChannel = groupByChannel(input.managedOrganicPosts);
  const placementsByChannel = groupByChannel(input.placements);
  const slots: Array<
    { channelId: string; date: string } & Record<string, unknown>
  > = [];
  const summaries: Array<{
    channelId: string;
    date: string;
    timezone: string;
    organicPostsCountForDay: number;
    adsCountForDay: number;
  }> = [];

  for (const channel of input.channels) {
    const policy = input.policyByChannel.get(channel.id)!;
    const preview = input.pricingByChannel.get(channel.id)!;
    const product = input.productsByChannel.get(channel.id)?.[0] ?? null;
    const channelPlacements = placementsByChannel.get(channel.id) ?? [];
    const publishedIds = new Set(
      (postsByChannel.get(channel.id) ?? []).map(
        (post) => post.telegramMessageId,
      ),
    );
    const timeline = [
      ...(postsByChannel.get(channel.id) ?? []).map((post) => ({
        id: `post:${post.id}`,
        at: post.postDate,
      })),
      ...(managedByChannel.get(channel.id) ?? [])
        .filter(
          (post) =>
            !post.telegramMessageIds.some((messageId) =>
              publishedIds.has(messageId),
            ),
        )
        .map((post) => ({
          id: `managed:${post.id}`,
          at: post.publishedAt ?? post.scheduledAt,
        })),
    ]
      .filter((item): item is { id: string; at: Date } => item.at != null)
      .sort((left, right) => left.at.getTime() - right.at.getTime());
    const cadence = Math.max(1, policy.organicPostsPerAdSlot);
    const timelineByDate = new Map<string, Array<{ id: string; at: Date }>>();
    for (const item of timeline) {
      const dateKey = utcDateKey(item.at, policy.timezone);
      const current = timelineByDate.get(dateKey) ?? [];
      current.push(item);
      timelineByDate.set(dateKey, current);
    }
    const placementsByDate = new Map<string, AvailabilityPlacement[]>();
    const placementsByOpportunity = new Map<string, AvailabilityPlacement>();
    for (const placement of channelPlacements) {
      if (placement.status === TelegramAdPlacementStatus.CANCELLED) continue;
      const dateKey = utcDateKey(placement.scheduledAt, policy.timezone);
      const current = placementsByDate.get(dateKey) ?? [];
      current.push(placement);
      placementsByDate.set(dateKey, current);
      if (placement.inventoryOpportunityKey) {
        placementsByOpportunity.set(
          placement.inventoryOpportunityKey,
          placement,
        );
      }
    }
    for (const placements of placementsByDate.values()) {
      placements.sort(
        (left, right) =>
          left.scheduledAt.getTime() - right.scheduledAt.getTime(),
      );
    }
    const historicalOrganicPosts = timeline.filter(
      (item) => item.at >= input.historyFrom && item.at <= now,
    ).length;
    const projectedPostsPerDay = projectedOrganicPostsPerDay({
      channel,
      policy,
      historicalOrganicPosts,
      historyWindowDays: input.historyWindowDays,
    });
    const typicalSlotsPerDay = Math.max(
      1,
      Math.round(projectedPostsPerDay / cadence),
    );
    let carryoverOrganicPosts =
      timeline.filter((item) => item.at < input.from).length % cadence;
    let opportunityCounter = 0;
    for (
      let cursor = new Date(input.from);
      cursor <= input.to;
      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
    ) {
      const dateKey = utcDateKey(cursor, policy.timezone);
      const actualTimeline = timelineByDate.get(dateKey) ?? [];
      const dayTimeline =
        actualTimeline.length === 0 && cursor.getTime() > now.getTime()
          ? projectedOrganicTimeline({
              dateKey,
              timezone: policy.timezone,
              projectedCount: projectedPostsPerDay,
              scheduledTimes: channel.timePosts,
            })
          : actualTimeline;
      const carryIn = carryoverOrganicPosts;
      const rawSlotsForDay = Math.floor(
        (carryIn + dayTimeline.length) / cadence,
      );
      const totalSlotsForDay = Math.min(
        rawSlotsForDay,
        policy.maxAdsPerDay >= 0 ? policy.maxAdsPerDay : rawSlotsForDay,
        typicalSlotsPerDay,
      );
      carryoverOrganicPosts = (carryIn + dayTimeline.length) % cadence;
      const placementsForDate = placementsByDate.get(dateKey) ?? [];
      const isPast = dateKey < utcDateKey(now, policy.timezone);
      const displaySlots = Math.max(
        totalSlotsForDay,
        placementsForDate.length +
          (!isPast || !placementsForDate.length ? 1 : 0),
      );
      summaries.push({
        channelId: channel.id,
        date: dateKey,
        timezone: policy.timezone,
        organicPostsCountForDay: dayTimeline.length,
        adsCountForDay: Math.max(totalSlotsForDay, placementsForDate.length),
      });
      for (let slotIndex = 0; slotIndex < displaySlots; slotIndex += 1) {
        opportunityCounter += 1;
        const triggerIndex = Math.min(
          dayTimeline.length - 1,
          Math.max(0, (slotIndex + 1) * cadence - carryIn - 1),
        );
        const nextOrganicPostAt =
          dayTimeline[triggerIndex]?.at ?? dayTimeline.at(-1)?.at ?? null;
        const fallbackAt = zonedDateTimeToUtc(
          dateKey,
          '12:00',
          policy.timezone,
        );
        const opportunityKey = `cadence:${channel.id}:${opportunityCounter}:${dateKey}`;
        const existing =
          placementsByOpportunity.get(opportunityKey) ??
          placementsForDate[slotIndex] ??
          null;
        const scheduledAt =
          existing?.scheduledAt ?? nextOrganicPostAt ?? fallbackAt;
        if (scheduledAt < input.from) continue;
        slots.push({
          channelId: channel.id,
          date: dateKey,
          inventoryOpportunityKey: opportunityKey,
          scheduledAt: scheduledAt.toISOString(),
          timezone: policy.timezone,
          source: 'cadence',
          state: existing
            ? existing.status === TelegramAdPlacementStatus.RESERVED
              ? 'RESERVED'
              : 'SOLD'
            : isPast
              ? 'PAST'
              : 'AVAILABLE',
          blockingReason: null,
          nextOrganicPostAt: nextOrganicPostAt?.toISOString() ?? null,
          productId: product?.id ?? null,
          expectedViews: preview.expectedViews ?? 0,
          recommendedPrice: preview.recommendedPrice,
          minimumPrice: preview.minimumPrice,
          currency: preview.currency,
          existingPlacement: existing
            ? {
                id: existing.id,
                saleId: existing.telegramAdSaleId,
                status: existing.status,
                scheduledAt: existing.scheduledAt.toISOString(),
                title: existing.sale?.title ?? null,
                advertiserName:
                  existing.sale?.advertiserNameSnapshot ??
                  existing.sale?.advertiserName ??
                  null,
                saleStatus: existing.sale?.status ?? null,
                paymentStatus: existing.sale?.paymentStatus ?? null,
                agreedPrice: decimalToString(existing.agreedPrice),
                currency: existing.currency,
                viewsCount:
                  existing.telegramPost?.viewsCount ??
                  existing.actualViewsFinal ??
                  existing.actualViews48h ??
                  existing.actualViews24h ??
                  null,
              }
            : null,
          organicPostsCountForDay: dayTimeline.length,
          adsCountForDay: placementsForDate.length,
        });
      }
    }
  }
  return {
    from: input.fromText,
    to: input.toText,
    slots,
    summaries,
    warnings: [],
  };
}
