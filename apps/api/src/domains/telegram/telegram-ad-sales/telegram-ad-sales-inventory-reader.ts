import {
  TelegramAdPlacementStatus,
  TelegramAdSlotStrategy,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { buildAvailabilitySlots } from './domain/slot-engine';
import { utcDateKey, zonedDateTimeToUtc } from './domain/timezone';
import { TelegramAdSalesPricingReader } from './telegram-ad-sales-pricing-reader';

export type AdSalesInventorySlot = ReturnType<
  typeof buildAvailabilitySlots
>[number] & {
  channelId: string;
  date: string;
};

export class TelegramAdSalesInventoryReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingReader: TelegramAdSalesPricingReader,
  ) {}

  async slotsForChannels(params: {
    workspaceId: string;
    channelIds: string[];
    from: Date;
    to: Date;
  }) {
    if (!params.channelIds.length) return [] as AdSalesInventorySlot[];
    const channels = await this.prisma.telegramChannel.findMany({
      where: {
        workspaceId: params.workspaceId,
        id: { in: params.channelIds },
      },
      include: {
        timePosts: { orderBy: [{ position: 'asc' }, { time: 'asc' }] },
      },
    });
    const [
      workspace,
      workspaceSettings,
      policies,
      products,
      placements,
      pricingSources,
    ] = await Promise.all([
      this.prisma.workspace.findUniqueOrThrow({
        where: { id: params.workspaceId },
        select: { timezone: true },
      }),
      this.prisma.telegramAdSalesWorkspaceSettings.findUnique({
        where: { workspaceId: params.workspaceId },
      }),
      this.prisma.telegramAdSchedulePolicy.findMany({
        where: {
          workspaceId: params.workspaceId,
          telegramChannelId: { in: params.channelIds },
        },
      }),
      this.prisma.telegramAdProduct.findMany({
        where: {
          workspaceId: params.workspaceId,
          telegramChannelId: { in: params.channelIds },
          isActive: true,
        },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.telegramAdSalePlacement.findMany({
        where: {
          workspaceId: params.workspaceId,
          telegramChannelId: { in: params.channelIds },
          scheduledAt: {
            gte: new Date(params.from.getTime() - 7 * 24 * 60 * 60 * 1000),
            lte: new Date(params.to.getTime() + 24 * 60 * 60 * 1000),
          },
        },
        select: {
          id: true,
          telegramAdSaleId: true,
          telegramChannelId: true,
          status: true,
          scheduledAt: true,
        },
      }),
      this.pricingReader.sourcesForChannels(params.workspaceId, channels),
    ]);
    const workspaceTimezone = workspace.timezone || 'Europe/Warsaw';
    const cadence = workspaceSettings?.defaultOrganicPostsPerAdSlot ?? 3;
    const policyByChannel = new Map(
      policies.map((policy) => [policy.telegramChannelId, policy]),
    );
    const productsByChannel = new Map<string, typeof products>();
    for (const product of products) {
      const current = productsByChannel.get(product.telegramChannelId) ?? [];
      current.push(product);
      productsByChannel.set(product.telegramChannelId, current);
    }
    const placementsByChannel = new Map<string, typeof placements>();
    for (const placement of placements) {
      const current =
        placementsByChannel.get(placement.telegramChannelId) ?? [];
      current.push(placement);
      placementsByChannel.set(placement.telegramChannelId, current);
    }
    const slots: AdSalesInventorySlot[] = [];
    for (const channel of channels) {
      const storedPolicy = policyByChannel.get(channel.id);
      const policy = storedPolicy
        ? {
            ...storedPolicy,
            organicPostsPerAdSlot: storedPolicy.useWorkspaceDefault
              ? cadence
              : storedPolicy.organicPostsPerAdSlot,
          }
        : {
            timezone: workspaceTimezone,
            slotStrategy: TelegramAdSlotStrategy.BEFORE_ORGANIC_POST,
            fallbackSlotTimes: [] as string[],
            allowManualSlots: false,
            organicPostsPerAdSlot: cadence,
            maxAdsPerDay: 999,
            minHoursBetweenAds: 0,
            minDaysBetweenAds: 0,
          };
      const product = productsByChannel.get(channel.id)?.[0] ?? null;
      const pricingPreview = this.pricingReader.previewFromSource(
        pricingSources.get(channel.id)!,
        product,
      );
      const placementsByDate = new Map<string, typeof placements>();
      for (const placement of placementsByChannel.get(channel.id) ?? []) {
        if (placement.status === TelegramAdPlacementStatus.CANCELLED) continue;
        const dateKey = utcDateKey(placement.scheduledAt, policy.timezone);
        const current = placementsByDate.get(dateKey) ?? [];
        current.push(placement);
        placementsByDate.set(dateKey, current);
      }
      for (
        let cursor = new Date(params.from);
        cursor <= params.to;
        cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
      ) {
        const dateKey = utcDateKey(cursor, policy.timezone);
        const daySlots = buildAvailabilitySlots({
          now: new Date(),
          dateKey,
          policy: {
            timezone: policy.timezone,
            slotStrategy: policy.slotStrategy,
            fallbackSlotTimes: policy.fallbackSlotTimes,
            allowManualSlots: policy.allowManualSlots,
            organicPostsPerAdSlot: policy.organicPostsPerAdSlot,
            maxAdsPerDay: policy.maxAdsPerDay,
            minHoursBetweenAds: policy.minHoursBetweenAds,
            minDaysBetweenAds: policy.minDaysBetweenAds,
          },
          product: {
            id: product?.id ?? null,
            topDurationMinutes: product?.topDurationMinutes ?? null,
            currency: pricingPreview.currency,
            expectedViews: pricingPreview.expectedViews ?? 0,
            recommendedPrice: pricingPreview.recommendedPrice,
            minimumPrice: pricingPreview.minimumPrice,
          },
          organicTimes:
            policy.slotStrategy === TelegramAdSlotStrategy.FIXED_TIMES
              ? policy.fallbackSlotTimes
              : channel.timePosts.map((timePost) => timePost.time),
          organicScheduledAt: channel.timePosts.map((timePost) =>
            zonedDateTimeToUtc(dateKey, timePost.time, policy.timezone),
          ),
          placements: (placementsByDate.get(dateKey) ?? []).map(
            (placement) => ({
              id: placement.id,
              saleId: placement.telegramAdSaleId,
              status: placement.status,
              scheduledAt: placement.scheduledAt,
            }),
          ),
        });
        slots.push(
          ...daySlots.map((slot) => ({
            ...slot,
            channelId: channel.id,
            date: dateKey,
          })),
        );
      }
    }
    return slots;
  }
}

export function summarizeAdSalesInventory(slots: AdSalesInventorySlot[]) {
  const eligible = slots.filter((slot) => slot.state !== 'MANUAL_ONLY');
  const sold = eligible.filter((slot) => slot.state === 'SOLD');
  const published = sold.filter(
    (slot) =>
      slot.existingPlacement?.status === TelegramAdPlacementStatus.PUBLISHED,
  );
  return {
    eligibleSlots: eligible.length,
    availableSlots: eligible.filter((slot) => slot.state === 'AVAILABLE')
      .length,
    reservedSlots: eligible.filter((slot) => slot.state === 'RESERVED').length,
    soldSlots: sold.length,
    publishedSlots: published.length,
    blockedSlots: slots.filter((slot) =>
      [
        'BLOCKED_BY_POLICY',
        'CONFLICT_WITH_AD',
        'CONFLICT_WITH_ORGANIC_POST',
        'MANUAL_ONLY',
      ].includes(slot.state),
    ).length,
    pastUnusedSlots: eligible.filter((slot) => slot.state === 'PAST').length,
    bookingFillRate: eligible.length ? sold.length / eligible.length : 0,
    publishedFillRate: eligible.length ? published.length / eligible.length : 0,
  };
}
