import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { TelegramPublicationSlotOccurrence } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import {
  TelegramPublicationOccurrenceQueryDto,
  TelegramPublicationScheduleAssignmentInputDto,
  TelegramPublicationScheduleInputDto,
} from './telegram-publication-schedules.dto';

const scheduleInclude = {
  icon: true,
  slots: { include: { icon: true }, orderBy: [{ position: 'asc' as const }] },
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
    return {
      id: row.id,
      name: row.name,
      iconId: row.iconId,
      iconPresentation: iconToResolvedEmoji(row.icon),
      isDefault: row.isDefault,
      assignedChannelsCount: row._count?.channelAssignments ?? 0,
      slots: row.slots.map((slot: any) => ({
        id: slot.id,
        scheduleId: slot.scheduleId,
        title: slot.title,
        kind: slot.kind,
        time: slot.time,
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
            create: dto.slots.map((s, i) => ({
              title: s.title.trim(),
              kind: s.kind,
              time: s.time,
              position: s.position ?? i,
              isActive: s.isActive ?? true,
              iconId: s.iconId ?? null,
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
      for (const [i, slot] of dto.slots.entries()) {
        const data = {
          title: slot.title.trim(),
          kind: slot.kind,
          time: slot.time,
          position: slot.position ?? i,
          isActive: slot.isActive ?? true,
          iconId: slot.iconId ?? null,
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
        const [hour, minute] = slot.time.split(':').map(Number);
        const scheduledAt = this.zonedDate(
          localDate.year,
          localDate.month,
          localDate.day,
          hour,
          minute,
          timezone,
        );
        if (scheduledAt >= from && scheduledAt < to)
          results.push({
            slotId: slot.id,
            scheduledAt: scheduledAt.toISOString(),
            title: slot.title,
            kind: slot.kind,
            time: slot.time,
            timezone,
          });
      }
    }
    return results.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
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
  private zonedDate(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    timezone: string,
  ) {
    let value = Date.UTC(year, month - 1, day, hour, minute);
    for (let i = 0; i < 3; i++) {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(new Date(value));
      const get = (type: string) =>
        Number(parts.find((p) => p.type === type)?.value);
      const represented = Date.UTC(
        get('year'),
        get('month') - 1,
        get('day'),
        get('hour'),
        get('minute'),
      );
      value += Date.UTC(year, month - 1, day, hour, minute) - represented;
    }
    return new Date(value);
  }
}
