import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { notifyScheduledTaskDueWorkChanged } from '../../../common/scheduled-task-wake-notifier';
import { ChannelReminderDeliveryService } from '../../operations/notifications/channel-reminder-delivery.service';
import {
  utcDateKey,
  utcTimeKey,
  zonedDateTimeToUtc,
} from '../telegram-ad-sales/domain/timezone';
import { TelegramChannelBookingReadService } from './telegram-channel-booking-read.service';
import { CHANNEL_REMINDERS_TASK_KEY } from './telegram-channel-reminders.service';

const DAY = 86400000;
const BATCH_SIZE = 500;
const eligibleChannel = {
  isActive: true,
  archivedAt: null,
  assignedMemberId: { not: null },
} as const;
function shiftDay(day: string, offset: number) {
  return new Date(Date.parse(day + 'T00:00:00Z') + offset * DAY)
    .toISOString()
    .slice(0, 10);
}
function nextWake(now: Date, timezone: string, empty: boolean) {
  const today = utcDateKey(now, timezone);
  const times = empty ? ['09:00', '21:00'] : ['09:00'];
  for (const time of times) {
    const candidate = zonedDateTimeToUtc(today, time, timezone);
    if (candidate.getTime() > now.getTime() + 60000) return candidate;
  }
  return zonedDateTimeToUtc(shiftDay(today, 1), '09:00', timezone);
}

@Injectable()
export class TelegramChannelRemindersDueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly booking: TelegramChannelBookingReadService,
    @Inject(forwardRef(() => ChannelReminderDeliveryService))
    private readonly delivery: ChannelReminderDeliveryService,
  ) {}
  async nextDueAt() {
    const row = await this.prisma.telegramChannelReminderAssignment.findFirst({
      where: { channel: eligibleChannel },
      orderBy: [{ nextDueAt: 'asc' }, { id: 'asc' }],
      select: { nextDueAt: true },
    });
    return row?.nextDueAt ?? null;
  }
  async processDueActions(now = new Date()) {
    const rows = await this.prisma.telegramChannelReminderAssignment.findMany({
      where: { nextDueAt: { lte: now }, channel: eligibleChannel },
      orderBy: [{ nextDueAt: 'asc' }, { id: 'asc' }],
      take: BATCH_SIZE,
      include: {
        template: true,
        workspace: { select: { timezone: true } },
        channel: {
          select: {
            title: true,
            isActive: true,
            archivedAt: true,
            assignedMemberId: true,
          },
        },
      },
    });
    const workspaces = new Map<string, typeof rows>();
    for (const row of rows) {
      const group = workspaces.get(row.workspaceId) ?? [];
      group.push(row);
      workspaces.set(row.workspaceId, group);
    }
    let deliveryFailure: unknown;
    for (const [workspaceId, group] of workspaces) {
      const timezone = group[0].workspace.timezone || 'UTC';
      const today = utcDateKey(now, timezone);
      const summaries = await this.booking.summariesForChannels(
        workspaceId,
        group.map((row) => row.channelId),
        now,
        new Map(),
        32,
        true,
        false,
      );
      const current =
        await this.prisma.telegramChannelReminderAssignment.findMany({
          where: {
            workspaceId,
            id: { in: group.map((row) => row.id) },
            channel: eligibleChannel,
          },
          select: {
            id: true,
            templateId: true,
            nextDueAt: true,
            template: { select: { updatedAt: true } },
            channel: { select: { assignedMemberId: true } },
          },
        });
      const fresh = new Map(current.map((row) => [row.id, row]));
      const messages = new Map<
        string,
        {
          memberId: string;
          stage: string;
          channels: { id: string; title: string }[];
        }
      >();
      const next = new Map<number, typeof rows>();
      for (const row of group) {
        const live = fresh.get(row.id);
        if (
          !live ||
          live.templateId !== row.templateId ||
          live.nextDueAt.getTime() !== row.nextDueAt.getTime() ||
          live.template.updatedAt.getTime() !==
            row.template.updatedAt.getTime() ||
          live.channel.assignedMemberId !== row.channel.assignedMemberId
        )
          continue;
        const summary = summaries.get(row.channelId);
        const empty = !summary?.hasPostsToday;
        const days = summary?.bookedThroughDate
          ? Math.round(
              (Date.parse(summary.bookedThroughDate + 'T00:00:00Z') -
                Date.parse(today + 'T00:00:00Z')) /
                DAY,
            )
          : 0;
        const stage =
          empty && row.template.notifyEmpty
            ? 'empty'
            : row.template.daysBefore.includes(days)
              ? String(days)
              : null;
        if (
          stage &&
          row.channel.assignedMemberId &&
          row.channel.isActive &&
          !row.channel.archivedAt
        ) {
          const key = row.channel.assignedMemberId + ':' + stage;
          const message = messages.get(key) ?? {
            memberId: row.channel.assignedMemberId,
            stage,
            channels: [],
          };
          message.channels.push({
            id: row.channelId,
            title: row.channel.title,
          });
          messages.set(key, message);
        }
        const wake = nextWake(
          now,
          timezone,
          empty && row.template.notifyEmpty,
        ).getTime();
        const bucket = next.get(wake) ?? [];
        bucket.push(row);
        next.set(wake, bucket);
      }
      const failedChannels = new Set<string>();
      for (const message of messages.values()) {
        message.channels.sort((a, b) => a.id.localeCompare(b.id));
        const slot =
          message.stage === 'empty' && utcTimeKey(now, timezone) >= '15:00'
            ? 'evening'
            : 'morning';
        const title =
          message.stage === 'empty'
            ? 'Нет запланированных постов на сегодня'
            : `Посты запланированы ещё на ${message.stage} дн.`;
        const chunks: Array<typeof message.channels> = [];
        let chunk: typeof message.channels = [];
        let size = 0;
        for (const channel of message.channels) {
          const length = Math.min(channel.title.length, 3400) + 3;
          if (chunk.length && size + length > 3500) {
            chunks.push(chunk);
            chunk = [];
            size = 0;
          }
          chunk.push(channel);
          size += length;
        }
        if (chunk.length) chunks.push(chunk);
        for (const channels of chunks) {
          const hash = createHash('sha256')
            .update(channels.map((channel) => channel.id).join(','))
            .digest('hex')
            .slice(0, 16);
          try {
            await this.delivery.deliver({
              workspaceId,
              memberId: message.memberId,
              sourceKey: `channel-reminder:${today}:${slot}:${message.stage}:${hash}`,
              title,
              body: channels
                .map((channel) => `• ${channel.title.slice(0, 3400)}`)
                .join('\n'),
            });
          } catch (error) {
            deliveryFailure ??= error;
            for (const channel of message.channels)
              failedChannels.add(channel.id);
            break;
          }
        }
      }
      for (const [timestamp, assignments] of next) {
        const completed = assignments.filter(
          (row) => !failedChannels.has(row.channelId),
        );
        if (!completed.length) continue;
        await this.prisma.telegramChannelReminderAssignment.updateMany({
          where: {
            workspaceId,
            OR: completed.map((row) => ({
              id: row.id,
              nextDueAt: row.nextDueAt,
            })),
          },
          data: { nextDueAt: new Date(timestamp) },
        });
      }
    }
    notifyScheduledTaskDueWorkChanged(CHANNEL_REMINDERS_TASK_KEY);
    if (deliveryFailure) throw deliveryFailure;
    return { processed: rows.length };
  }
}
