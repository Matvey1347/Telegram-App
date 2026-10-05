import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  TelegramPublicationPlanCalendar,
  TelegramPublicationPlanCalendarEvent,
  TelegramPublicationSlotOccurrence,
  TelegramPublicationSlotOccurrencesByChannel,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import {
  TelegramPublicationOccurrenceQueryDto,
  TelegramPublicationBatchOccurrenceQueryDto,
  TelegramPublicationPlanCalendarQueryDto,
  TelegramPublicationScheduleAssignmentInputDto,
  TelegramPublicationScheduleInputDto,
} from './telegram-publication-schedules.dto';
import {
  publicationScheduleOccurrenceAt,
  publicationScheduleTimeInTimezone,
  publicationScheduleTimeToUtc,
} from './telegram-publication-schedule-times';

const scheduleInclude = {
  icon: true,
  workspace: { select: { timezone: true } },
  slots: { include: { icon: true }, orderBy: [{ position: 'asc' as const }] },
  channelAssignments: { select: { channelId: true } },
  _count: { select: { channelAssignments: true } },
};
@Injectable()
export class TelegramPublicationSchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspace: WorkspaceService,
  ) {}

  private workspaceId(userId: string) {
    return this.workspace.resolveWorkspaceIdForUser(userId);
  }
  private map(row: any) {
    const timezone = row.workspace?.timezone || 'UTC';
    return {
      id: row.id,
      name: row.name,
      iconId: row.iconId,
      iconPresentation: iconToResolvedEmoji(row.icon),
      timezone,
      isDefault: row.isDefault,
      assignedChannelsCount: row._count?.channelAssignments ?? 0,
      assignedChannelIds: row.channelAssignments.map(
        (assignment: { channelId: string }) => assignment.channelId,
      ),
      slots: row.slots.map((slot: any) => ({
        id: slot.id,
        scheduleId: slot.scheduleId,
        title: slot.title,
        kind: slot.kind,
        time: publicationScheduleTimeInTimezone(slot.time, timezone),
        position: slot.position,
        isActive: slot.isActive,
        iconPresentation: iconToResolvedEmoji(slot.icon),
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
  private async validateIcons(
    workspaceId: string,
    dto: TelegramPublicationScheduleInputDto,
  ) {
    const ids = [
      ...new Set(
        [dto.iconId, ...dto.slots.map((s) => s.iconId)].filter(
          Boolean,
        ) as string[],
      ),
    ];
    if (!ids.length) return;
    const count = await this.prisma.icon.count({
      where: { id: { in: ids }, OR: [{ workspaceId }, { workspaceId: null }] },
    });
    if (count !== ids.length)
      throw new BadRequestException(
        'One or more icons are unavailable in this workspace',
      );
  }
  private async workspaceTimezone(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { timezone: true },
    });
    return workspace?.timezone || 'UTC';
  }
  private slotsForPersistence(
    slots: TelegramPublicationScheduleInputDto['slots'],
    timezone: string,
  ) {
    return slots.map((slot, index) => ({
      ...slot,
      time: publicationScheduleTimeToUtc(slot.time, timezone),
      position: slot.position ?? index,
      isActive: slot.isActive ?? true,
      iconId: slot.iconId ?? null,
    }));
  }
  async list(userId: string) {
    const workspaceId = await this.workspaceId(userId);
    return (
      await this.prisma.telegramPublicationSchedule.findMany({
        where: { workspaceId },
        include: scheduleInclude,
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      })
    ).map((x) => this.map(x));
  }
  async create(userId: string, dto: TelegramPublicationScheduleInputDto) {
    const workspaceId = await this.workspaceId(userId);
    await this.validateIcons(workspaceId, dto);
    const slots = this.slotsForPersistence(
      dto.slots,
      await this.workspaceTimezone(workspaceId),
    );
    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault)
        await tx.telegramPublicationSchedule.updateMany({
          where: { workspaceId, isDefault: true },
          data: { isDefault: false },
        });
      return tx.telegramPublicationSchedule.create({
        data: {
          workspaceId,
          name: dto.name.trim(),
          iconId: dto.iconId ?? null,
          isDefault: dto.isDefault ?? false,
          slots: {
            create: slots.map((s) => ({
              title: s.title.trim(),
              kind: s.kind,
              time: s.time,
              position: s.position,
              isActive: s.isActive,
              iconId: s.iconId,
            })),
          },
        },
        include: scheduleInclude,
      });
    });
    return this.map(row);
  }
  async update(
    userId: string,
    id: string,
    dto: TelegramPublicationScheduleInputDto,
  ) {
    const workspaceId = await this.workspaceId(userId);
    await this.validateIcons(workspaceId, dto);
    const existing = await this.prisma.telegramPublicationSchedule.findFirst({
      where: { id, workspaceId },
      select: { id: true, slots: { select: { id: true } } },
    });
    if (!existing)
      throw new NotFoundException('Publication schedule not found');
    const existingIds = new Set(existing.slots.map((s) => s.id));
    if (dto.slots.some((s) => s.id && !existingIds.has(s.id)))
      throw new BadRequestException('Slot does not belong to this schedule');
    const retained = dto.slots.map((s) => s.id).filter(Boolean) as string[];
    const slots = this.slotsForPersistence(
      dto.slots,
      await this.workspaceTimezone(workspaceId),
    );
    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault)
        await tx.telegramPublicationSchedule.updateMany({
          where: { workspaceId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      await tx.telegramPublicationSchedule.update({
        where: { id },
        data: {
          name: dto.name.trim(),
          iconId: dto.iconId ?? null,
          isDefault: dto.isDefault ?? false,
        },
      });
      await tx.telegramPublicationScheduleSlot.deleteMany({
        where: { scheduleId: id, id: { notIn: retained } },
      });
      for (const slot of slots) {
        const data = {
          title: slot.title.trim(),
          kind: slot.kind,
          time: slot.time,
          position: slot.position,
          isActive: slot.isActive,
          iconId: slot.iconId,
        };
        if (slot.id)
          await tx.telegramPublicationScheduleSlot.update({
            where: { id: slot.id },
            data,
          });
        else
          await tx.telegramPublicationScheduleSlot.create({
            data: { ...data, scheduleId: id },
          });
      }
      return tx.telegramPublicationSchedule.findUniqueOrThrow({
        where: { id },
        include: scheduleInclude,
      });
    });
    return this.map(row);
  }
  async remove(userId: string, id: string) {
    const workspaceId = await this.workspaceId(userId);
    const result = await this.prisma.telegramPublicationSchedule.deleteMany({
      where: { id, workspaceId },
    });
    if (!result.count)
      throw new NotFoundException('Publication schedule not found');
    return { success: true };
  }
  private async channel(workspaceId: string, channelId: string) {
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId },
      select: { id: true },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
  }
  async assignment(userId: string, channelId: string) {
    const workspaceId = await this.workspaceId(userId);
    await this.channel(workspaceId, channelId);
    const row =
      await this.prisma.telegramChannelPublicationScheduleAssignment.findFirst({
        where: { workspaceId, channelId },
        include: {
          selectedSlots: { select: { slotId: true } },
          schedule: { include: scheduleInclude },
        },
      });
    if (!row) return null;
    return {
      id: row.id,
      channelId,
      scheduleId: row.scheduleId,
      selectionMode: row.selectionMode,
      selectedSlotIds: row.selectedSlots.map((x) => x.slotId),
      schedule: this.map(row.schedule),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
  async assign(
    userId: string,
    channelId: string,
    dto: TelegramPublicationScheduleAssignmentInputDto,
  ) {
    const workspaceId = await this.workspaceId(userId);
    await this.channel(workspaceId, channelId);
    const schedule = await this.prisma.telegramPublicationSchedule.findFirst({
      where: { id: dto.scheduleId, workspaceId },
      select: { id: true, slots: { select: { id: true } } },
    });
    if (!schedule)
      throw new NotFoundException('Publication schedule not found');
    const selected = [...new Set(dto.selectedSlotIds ?? [])];
    const available = new Set(schedule.slots.map((s) => s.id));
    if (selected.some((id) => !available.has(id)))
      throw new BadRequestException(
        'Selected slot does not belong to this schedule',
      );
    if (dto.selectionMode === 'SUBSET' && !selected.length)
      throw new BadRequestException(
        'SUBSET assignment requires at least one slot',
      );
    await this.prisma.$transaction(async (tx) => {
      const assignment =
        await tx.telegramChannelPublicationScheduleAssignment.upsert({
          where: { channelId },
          create: {
            workspaceId,
            channelId,
            scheduleId: dto.scheduleId,
            selectionMode: dto.selectionMode,
          },
          update: {
            scheduleId: dto.scheduleId,
            selectionMode: dto.selectionMode,
          },
        });
      await tx.telegramChannelPublicationScheduleSelectedSlot.deleteMany({
        where: { assignmentId: assignment.id },
      });
      if (dto.selectionMode === 'SUBSET')
        await tx.telegramChannelPublicationScheduleSelectedSlot.createMany({
          data: selected.map((slotId) => ({
            assignmentId: assignment.id,
            slotId,
          })),
        });
    });
    return this.assignment(userId, channelId);
  }
  async occurrences(
    userId: string,
    channelId: string,
    query: TelegramPublicationOccurrenceQueryDto,
  ): Promise<TelegramPublicationSlotOccurrence[]> {
    const from = new Date(query.from),
      to = new Date(query.to);
    if (!(from < to) || to.getTime() - from.getTime() > 62 * 86400000)
      throw new BadRequestException(
        'Occurrence range must be positive and no longer than 62 days',
      );
    const assignment = await this.assignment(userId, channelId);
    if (!assignment) return [];
    const workspaceId = await this.workspaceId(userId);
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { timezone: true },
    });
    const timezone = workspace?.timezone || 'UTC';
    const selected = new Set(assignment.selectedSlotIds);
    const slots = assignment.schedule.slots.filter(
      (s: any) =>
        s.isActive &&
        (assignment.selectionMode === 'FULL' || selected.has(s.id)),
    );
    const slotIds = slots.map((slot) => slot.id);
    const reservations = slotIds.length
      ? await this.prisma.telegramManagedPost.findMany({
          where: {
            workspaceId,
            telegramChannelId: channelId,
            status: { in: ['SCHEDULED', 'PUBLISHING', 'PUBLISHED'] },
            OR: [
              { scheduledAt: { gte: from, lt: to } },
              { publishedAt: { gte: from, lt: to } },
            ],
          },
          select: {
            id: true,
            title: true,
            status: true,
            publicationSlotId: true,
            scheduledAt: true,
            publishedAt: true,
          },
        })
      : [];
    // Legacy/custom posts at an exact slot time still consume it; older paths did not persist publicationSlotId.
    const reservationByScheduledAt = new Map(
      reservations.flatMap((post) => {
        const date = post.scheduledAt ?? post.publishedAt;
        return date ? [[date.toISOString(), post] as const] : [];
      }),
    );
    const results: TelegramPublicationSlotOccurrence[] = [];
    for (
      let cursor = new Date(
        Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
      );
      cursor <= to;
      cursor = new Date(cursor.getTime() + 86400000)
    ) {
      for (const slot of slots) {
        const localDate = this.localDateParts(cursor, timezone);
        // Slot time is persisted as its canonical UTC time-of-day. Converting
        // it from the workspace timezone again shifts its instant at DST
        // boundaries and makes the returned occurrence fail SLOT validation.
        const scheduledAt = publicationScheduleOccurrenceAt(
          localDate,
          slot.time,
        );
        if (scheduledAt >= from && scheduledAt < to) {
          const reservation = reservationByScheduledAt.get(
            scheduledAt.toISOString(),
          );
          results.push({
            slotId: slot.id,
            scheduledAt: scheduledAt.toISOString(),
            title: slot.title,
            kind: slot.kind,
            time: slot.time,
            timezone,
            state: reservation
              ? 'OCCUPIED'
              : scheduledAt.getTime() <= Date.now()
                ? 'PAST'
                : 'AVAILABLE',
            postId: reservation?.id ?? null,
            postTitle: reservation?.title ?? null,
          });
        }
      }
    }
    return results.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  }
  async occurrencesByChannels(
    userId: string,
    query: TelegramPublicationBatchOccurrenceQueryDto,
    includeReservations = true,
  ): Promise<TelegramPublicationSlotOccurrencesByChannel> {
    const channelIds = [
      ...new Set(query.channelIds.split(',').map((id) => id.trim())),
    ];
    if (
      !channelIds.length ||
      channelIds.length > 100 ||
      channelIds.some((id) => !id)
    )
      throw new BadRequestException('Supply between 1 and 100 channel IDs');
    const from = new Date(query.from),
      to = new Date(query.to);
    if (
      !Number.isFinite(from.getTime()) ||
      !Number.isFinite(to.getTime()) ||
      !(from < to) ||
      to.getTime() - from.getTime() > 62 * 86400000
    )
      throw new BadRequestException(
        'Occurrence range must be positive and no longer than 62 days',
      );
    const workspaceId = await this.workspaceId(userId);
    const channels = await this.prisma.telegramChannel.findMany({
      where: { id: { in: channelIds }, workspaceId },
      select: { id: true },
    });
    if (channels.length !== channelIds.length)
      throw new NotFoundException('Telegram channel not found');
    const [assignments, workspace] = await Promise.all([
      this.prisma.telegramChannelPublicationScheduleAssignment.findMany({
        where: { workspaceId, channelId: { in: channelIds } },
        select: {
          channelId: true,
          selectionMode: true,
          selectedSlots: { select: { slotId: true } },
          schedule: {
            select: {
              slots: {
                select: {
                  id: true,
                  title: true,
                  kind: true,
                  time: true,
                  isActive: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { timezone: true },
      }),
    ]);
    const timezone = workspace?.timezone || 'UTC';
    const slotsByChannel = new Map(
      assignments.map((assignment) => {
        const selected = new Set(
          assignment.selectedSlots.map((slot) => slot.slotId),
        );
        return [
          assignment.channelId,
          assignment.schedule.slots.filter(
            (slot) =>
              slot.isActive &&
              (assignment.selectionMode === 'FULL' || selected.has(slot.id)),
          ),
        ] as const;
      }),
    );
    const slotIds = [
      ...new Set(
        [...slotsByChannel.values()].flatMap((slots) =>
          slots.map((slot) => slot.id),
        ),
      ),
    ];
    const reservations =
      includeReservations && slotIds.length
        ? await this.prisma.telegramManagedPost.findMany({
            where: {
              workspaceId,
              telegramChannelId: { in: channelIds },
              status: { in: ['SCHEDULED', 'PUBLISHING', 'PUBLISHED'] },
              OR: [
                { scheduledAt: { gte: from, lt: to } },
                { publishedAt: { gte: from, lt: to } },
              ],
            },
            select: {
              id: true,
              title: true,
              telegramChannelId: true,
              publicationSlotId: true,
              scheduledAt: true,
              publishedAt: true,
            },
          })
        : [];
    const occupied = new Map(
      reservations.flatMap((post) => {
        const date = post.scheduledAt ?? post.publishedAt;
        return date
          ? [[`${post.telegramChannelId}:${date.toISOString()}`, post] as const]
          : [];
      }),
    );
    const result: TelegramPublicationSlotOccurrencesByChannel = {};
    const now = Date.now();
    const uniqueSlots = new Map(
      [...slotsByChannel.values()].flatMap((slots) =>
        slots.map((slot) => [slot.id, slot] as const),
      ),
    );
    const timesBySlot = new Map<string, string[]>();
    for (
      let cursor = new Date(
        Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
      );
      cursor <= to;
      cursor = new Date(cursor.getTime() + 86400000)
    ) {
      const localDate = this.localDateParts(cursor, timezone);
      for (const slot of uniqueSlots.values()) {
        const scheduledAt = publicationScheduleOccurrenceAt(localDate, slot.time);
        if (scheduledAt < from || scheduledAt >= to) continue;
        const times = timesBySlot.get(slot.id) ?? [];
        times.push(scheduledAt.toISOString());
        timesBySlot.set(slot.id, times);
      }
    }
    for (const channelId of channelIds) {
      const rows: TelegramPublicationSlotOccurrence[] = [];
      for (const slot of slotsByChannel.get(channelId) ?? []) {
        for (const scheduledAt of timesBySlot.get(slot.id) ?? []) {
          const reservation = occupied.get(`${channelId}:${scheduledAt}`);
          rows.push({
            slotId: slot.id,
            scheduledAt,
            title: slot.title,
            kind: slot.kind,
            time: publicationScheduleTimeInTimezone(slot.time, timezone),
            timezone,
            state: reservation
              ? 'OCCUPIED'
              : Date.parse(scheduledAt) <= now
                ? 'PAST'
                : 'AVAILABLE',
            postId: reservation?.id ?? null,
            postTitle: reservation?.title ?? null,
          });
        }
      }
      result[channelId] = rows.sort((a, b) =>
        a.scheduledAt.localeCompare(b.scheduledAt),
      );
    }
    return result;
  }

  async calendar(
    userId: string,
    query: TelegramPublicationPlanCalendarQueryDto,
  ): Promise<TelegramPublicationPlanCalendar> {
    const workspaceId = await this.workspaceId(userId);
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (!(from < to) || to.getTime() - from.getTime() > 62 * 86400000)
      throw new BadRequestException(
        'Calendar range must be positive and no longer than 62 days',
      );
    const [assignments, schedule] = await Promise.all([
      this.prisma.telegramChannelPublicationScheduleAssignment.findMany({
        where: { workspaceId, scheduleId: query.scheduleId },
        select: {
          channelId: true,
          selectionMode: true,
          selectedSlots: { select: { slotId: true } },
        },
      }),
      this.prisma.telegramPublicationSchedule.findFirst({
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
    const channelIds = assignments.map((assignment) => assignment.channelId);
    if (!schedule)
      throw new NotFoundException('Publication schedule not found');
    if (!channelIds.length)
      return { channelIds: [], occurrencesByChannel: {}, events: [] };
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
    const calendarRows: TelegramPublicationSlotOccurrence[] = [];
    for (
      let cursor = new Date(
        Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
      );
      cursor <= to;
      cursor = new Date(cursor.getTime() + 86400000)
    ) {
      const localDate = this.localDateParts(cursor, timezone);
      for (const slot of schedule.slots) {
        if (!selectedSlotIds.has(slot.id)) continue;
        const scheduledAt = publicationScheduleOccurrenceAt(localDate, slot.time);
        if (scheduledAt < from || scheduledAt >= to) continue;
        calendarRows.push({
          slotId: slot.id,
          scheduledAt: scheduledAt.toISOString(),
          title: slot.title,
          kind: slot.kind,
          time: publicationScheduleTimeInTimezone(slot.time, timezone),
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
      this.prisma.telegramAdSalePlacement.findMany({
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
      this.prisma.crossPromotionPlan.findMany({
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
            !channelIds.includes(channelId) ||
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
      ? await this.prisma.icon.findMany({
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
          placement.sale.advertiserName ??
          placement.sale.title ??
          'Advertising',
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
      channelIds,
      occurrencesByChannel: channelIds[0]
        ? { [channelIds[0]]: calendarRows }
        : {},
      events,
    };
  }
  private localDateParts(date: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const get = (type: string) =>
      Number(parts.find((p) => p.type === type)?.value);
    return { year: get('year'), month: get('month'), day: get('day') };
  }
}
