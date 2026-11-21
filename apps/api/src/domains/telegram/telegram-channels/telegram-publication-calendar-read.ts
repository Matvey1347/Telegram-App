import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { TelegramPublicationSlotKind } from '@prisma/client';
import type {
  TelegramPublicationPlanCalendar,
  TelegramPublicationPlanCalendarEvent,
  TelegramPublicationSlotOccurrence,
} from '@telegram-system/shared';
import type { PrismaService } from '../../../prisma/prisma.service';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import type { TelegramPublicationPlanCalendarQueryDto } from './telegram-publication-schedules.dto';
import {
  publicationScheduleLocalDateFormatter,
  publicationScheduleLocalDateParts,
  publicationScheduleOccurrenceAt,
  publicationScheduleTimeForDisplay,
} from './telegram-publication-schedule-times';

export async function readTelegramPublicationCalendar(
  prisma: PrismaService,
  workspaceId: string,
  query: TelegramPublicationPlanCalendarQueryDto,
): Promise<TelegramPublicationPlanCalendar> {
  const from = new Date(query.from);
  const to = new Date(query.to);
  if (!(from < to) || to.getTime() - from.getTime() > 62 * 86400000)
    throw new BadRequestException(
      'Calendar range must be positive and no longer than 62 days',
    );
  let assignments: Array<{
    channelId: string;
    selectionMode: string;
    selectedSlots: Array<{ slotId: string }>;
  }>;
  let schedule: {
    id: string;
    workspace: { timezone: string } | null;
    slots: Array<{
      id: string;
      title: string;
      kind: TelegramPublicationSlotKind;
      time: string;
    }>;
  } | null;
  if (query.scheduleId) {
    [assignments, schedule] = await Promise.all([
      prisma.telegramChannelPublicationScheduleAssignment.findMany({
        where: { workspaceId, scheduleId: query.scheduleId },
        select: {
          channelId: true,
          selectionMode: true,
          selectedSlots: { select: { slotId: true } },
        },
      }),
      prisma.telegramPublicationSchedule.findFirst({
        where: { id: query.scheduleId, workspaceId },
        select: {
          id: true,
          workspace: { select: { timezone: true } },
          slots: {
            where: { isActive: true, kind: 'AD' },
            select: { id: true, title: true, kind: true, time: true },
          },
        },
      }),
    ]);
  } else {
    // Resolve the same default used by the calendar selector while reading
    // the assignment and slot data in one request. This lets the initial
    // calendar request run alongside the schedule-list request.
    const defaultSchedule = await prisma.telegramPublicationSchedule.findFirst({
      where: { workspaceId },
      orderBy: [
        { isDefault: 'desc' },
        { channelAssignments: { _count: 'desc' } },
        { createdAt: 'asc' },
      ],
      select: {
        id: true,
        workspace: { select: { timezone: true } },
        slots: {
          where: { isActive: true, kind: 'AD' },
          select: { id: true, title: true, kind: true, time: true },
        },
        channelAssignments: {
          select: {
            channelId: true,
            selectionMode: true,
            selectedSlots: { select: { slotId: true } },
          },
        },
      },
    });
    schedule = defaultSchedule;
    assignments = defaultSchedule?.channelAssignments ?? [];
  }
  const channelIds = assignments.map((assignment) => assignment.channelId);
  const channelIdSet = new Set(channelIds);
  if (!schedule) {
    if (query.scheduleId)
      throw new NotFoundException('Publication schedule not found');
    return {
      scheduleId: null,
      channelIds: [],
      occurrencesByChannel: {},
      events: [],
    };
  }
  if (!channelIds.length)
    return {
      scheduleId: schedule.id,
      channelIds: [],
      occurrencesByChannel: {},
      events: [],
    };
  const selectedSlotIds = new Set<string>();
  for (const assignment of assignments) {
    if (assignment.selectionMode === 'FULL') {
      for (const slot of schedule.slots) selectedSlotIds.add(slot.id);
    } else {
      for (const selectedSlot of assignment.selectedSlots)
        selectedSlotIds.add(selectedSlot.slotId);
    }
  }
  const timezone = schedule.workspace?.timezone || 'UTC';
  const dateFormatter = publicationScheduleLocalDateFormatter(timezone);
  const calendarRows: TelegramPublicationSlotOccurrence[] = [];
  for (
    let cursor = new Date(
      Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
    );
    cursor <= to;
    cursor = new Date(cursor.getTime() + 86400000)
  ) {
    const localDate = publicationScheduleLocalDateParts(cursor, dateFormatter);
    for (const slot of schedule.slots) {
      if (!selectedSlotIds.has(slot.id)) continue;
      const scheduledAt = publicationScheduleOccurrenceAt(
        localDate,
        slot.time,
        timezone,
      );
      if (scheduledAt < from || scheduledAt >= to) continue;
      calendarRows.push({
        slotId: slot.id,
        scheduledAt: scheduledAt.toISOString(),
        title: slot.title,
        kind: slot.kind,
        time: publicationScheduleTimeForDisplay(slot.time),
        timezone,
        state: scheduledAt.getTime() <= Date.now() ? 'PAST' : 'AVAILABLE',
        postId: null,
        postTitle: null,
      });
    }
  }
  calendarRows.sort((left, right) =>
    left.scheduledAt.localeCompare(right.scheduledAt),
  );
  const [placements, crossPromotions] = await Promise.all([
    prisma.telegramAdSalePlacement.findMany({
      where: {
        workspaceId,
        telegramChannelId: { in: channelIds },
        status: { notIn: ['DRAFT', 'CANCELLED'] },
        scheduledAt: { gte: from, lt: to },
      },
      select: {
        id: true,
        telegramAdSaleId: true,
        telegramChannelId: true,
        scheduledAt: true,
        sale: {
          select: {
            title: true,
            advertiserName: true,
            advertiser: {
              select: {
                avatarIcon: {
                  select: {
                    id: true,
                    type: true,
                    name: true,
                    emoji: true,
                    imageUrl: true,
                  },
                },
                crmPeers: {
                  where: { photoUrl: { not: null } },
                  take: 1,
                  orderBy: { updatedAt: 'desc' },
                  select: { photoUrl: true },
                },
              },
            },
          },
        },
      },
    }),
    prisma.crossPromotionPlan.findMany({
      where: {
        workspaceId,
        publisherChannelIds: { hasSome: channelIds },
        status: { notIn: ['DRAFT', 'CANCELLED'] },
      },
      // Publisher-specific JSON timestamps cannot be range-indexed; keep this plan read bounded and filter placements below.
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 250,
      select: {
        id: true,
        title: true,
        scheduledAt: true,
        publisherChannelIds: true,
        publicationPost: true,
        advertiser: {
          select: {
            avatarIcon: {
              select: {
                id: true,
                type: true,
                name: true,
                emoji: true,
                imageUrl: true,
              },
            },
            crmPeers: {
              where: { photoUrl: { not: null } },
              take: 1,
              orderBy: { updatedAt: 'desc' },
              select: { photoUrl: true },
            },
          },
        },
      },
    }),
  ]);
  const vpPlacements = crossPromotions.flatMap((plan) => {
    const post = plan.publicationPost as {
      iconId?: unknown;
      publisherPlacements?: Array<{
        telegramChannelId?: unknown;
        scheduledAt?: unknown;
      }>;
      publisherPublications?: Array<{
        id?: unknown;
        post?: { iconId?: unknown };
        placements?: Array<{
          telegramChannelId?: unknown;
          scheduledAt?: unknown;
        }>;
      }>;
    } | null;
    const placementGroups = post?.publisherPublications?.length
      ? post.publisherPublications.map((publication, index) => ({
          publicationId:
            typeof publication.id === 'string'
              ? publication.id
              : `publisher-publication-${index}`,
          iconId: publication.post?.iconId ?? post?.iconId,
          placements: publication.placements ?? [],
        }))
      : [
          {
            publicationId: 'legacy-publisher-publication',
            iconId: post?.iconId,
            placements:
              post?.publisherPlacements ??
              plan.publisherChannelIds.map((telegramChannelId) => ({
                telegramChannelId,
                scheduledAt: plan.scheduledAt.toISOString(),
              })),
          },
        ];
    return placementGroups.flatMap(({ publicationId, iconId, placements }) =>
      placements.flatMap((placement) => {
        const channelId =
          typeof placement.telegramChannelId === 'string'
            ? placement.telegramChannelId
            : null;
        const scheduledAt =
          typeof placement.scheduledAt === 'string'
            ? new Date(placement.scheduledAt)
            : null;
        if (
          !channelId ||
          !scheduledAt ||
          !Number.isFinite(scheduledAt.getTime()) ||
          !channelIdSet.has(channelId) ||
          scheduledAt < from ||
          scheduledAt >= to
        )
          return [];
        return [{ plan, publicationId, channelId, scheduledAt, iconId }];
      }),
    );
  });
  const vpIconIds = vpPlacements.flatMap(({ iconId }) =>
    typeof iconId === 'string' ? [iconId] : [],
  );
  const icons = vpIconIds.length
    ? await prisma.icon.findMany({
        where: {
          id: { in: [...new Set(vpIconIds)] },
          OR: [{ workspaceId }, { workspaceId: null }],
        },
      })
    : [];
  const iconsById = new Map(icons.map((icon) => [icon.id, icon]));
  // A publication is one calendar event even when its channel deliveries use
  // different times. The earliest delivery is the operationally relevant slot.
  const vpEventsByPublication = new Map<
    string,
    TelegramPublicationPlanCalendarEvent
  >();
  for (const {
    plan,
    publicationId,
    channelId,
    scheduledAt,
    iconId,
  } of vpPlacements) {
    const key = `${plan.id}:${publicationId}`;
    const event: TelegramPublicationPlanCalendarEvent = {
      id: `${key}:${channelId}:${scheduledAt.toISOString()}`,
      channelId,
      scheduledAt: scheduledAt.toISOString(),
      title: plan.title,
      kind: 'VP',
      slotId: null,
      crossPromotionPlanId: plan.id,
      avatarPresentation: iconToResolvedEmoji(
        plan.advertiser?.avatarIcon ??
          (typeof iconId === 'string' ? iconsById.get(iconId) : null),
      ),
      avatarUrl: plan.advertiser?.crmPeers[0]?.photoUrl ?? null,
    };
    const earliest = vpEventsByPublication.get(key);
    if (!earliest || event.scheduledAt < earliest.scheduledAt)
      vpEventsByPublication.set(key, event);
  }
  const rawEvents: TelegramPublicationPlanCalendarEvent[] = [
    ...placements.map((placement) => ({
      id: placement.id,
      channelId: placement.telegramChannelId,
      scheduledAt: placement.scheduledAt.toISOString(),
      title:
        placement.sale.advertiserName ?? placement.sale.title ?? 'Advertising',
      kind: 'AD' as const,
      slotId: null,
      adSaleId: placement.telegramAdSaleId,
      avatarPresentation: iconToResolvedEmoji(
        placement.sale.advertiser?.avatarIcon,
      ),
      avatarUrl: placement.sale.advertiser?.crmPeers[0]?.photoUrl ?? null,
    })),
    ...vpEventsByPublication.values(),
  ];
  // A VP can have both its plan record and a materialized managed post: collapse that representation.
  const events = [
    ...new Map(
      rawEvents.map((event) => [
        `${event.channelId}:${event.scheduledAt}:${event.kind}:${event.title}`,
        event,
      ]),
    ).values(),
  ].sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt));
  return {
    scheduleId: schedule.id,
    channelIds,
    occurrencesByChannel: channelIds[0]
      ? { [channelIds[0]]: calendarRows }
      : {},
    events,
  };
}
