import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { notifyScheduledTaskDueWorkChanged } from '../../../common/scheduled-task-wake-notifier';
import { ChannelReminderDeliveryService } from '../../operations/notifications/channel-reminder-delivery.service';
import {
  coverageNotificationLines,
  publicationNotificationChannel,
  publicationNotificationChannelSelect,
  publicationNotificationHtml,
} from '../../operations/notifications/publication-notification-message';
import {
  utcDateKey,
  zonedDateTimeToUtc,
} from '../telegram-ad-sales/domain/timezone';
import { TelegramChannelBookingReadService } from './telegram-channel-booking-read.service';
import {
  activePublicationChannels,
  CHANNEL_REMINDERS_TASK_KEY,
} from './telegram-channel-reminders.service';

const DAY = 86400000;
const enabled = { publicationNotificationsEnabled: true } as const;

function morningAfter(today: string, timezone: string) {
  const tomorrow = new Date(Date.parse(today + 'T00:00:00Z') + DAY)
    .toISOString()
    .slice(0, 10);
  return zonedDateTimeToUtc(tomorrow, '09:00', timezone);
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
    const row = await this.prisma.workspace.findFirst({
      where: { ...enabled, publicationNotificationDueAt: { not: null } },
      orderBy: { publicationNotificationDueAt: 'asc' },
      select: { publicationNotificationDueAt: true },
    });
    return row?.publicationNotificationDueAt ?? null;
  }

  async processDueActions(now = new Date()) {
    const workspaces = await this.prisma.workspace.findMany({
      where: { ...enabled, publicationNotificationDueAt: { lte: now } },
      orderBy: [{ publicationNotificationDueAt: 'asc' }, { id: 'asc' }],
      take: 30,
      select: {
        id: true,
        timezone: true,
        coverageNotificationDestination: true,
        coverageNotificationSentKeys: true,
        publicationNotificationDueAt: true,
        publicationNotificationExcludedChannelIds: true,
      },
    });
    let deliveryFailure: Error | undefined;
    for (const workspace of workspaces) {
      const timezone = workspace.timezone || 'UTC';
      const today = utcDateKey(now, timezone);
      const where = {
        id: workspace.id,
        ...enabled,
        publicationNotificationDueAt: workspace.publicationNotificationDueAt,
      };
      try {
        const member = await this.prisma.workspaceMember.findFirst({
          where: { workspaceId: workspace.id, role: 'owner', isHidden: false },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { id: true },
        });
        const channels = member
          ? await this.prisma.telegramChannel.findMany({
              where: {
                workspaceId: workspace.id,
                ...activePublicationChannels,
                id: {
                  notIn: workspace.publicationNotificationExcludedChannelIds,
                },
              },
              orderBy: { id: 'asc' },
              select: publicationNotificationChannelSelect,
            })
          : [];
        if (member && channels.length) {
          const summaries = await this.booking.summariesForChannels(
            workspace.id,
            channels.map(({ id }) => id),
            now,
            new Map(),
            8,
            true,
            false,
          );
          if (
            !(await this.prisma.workspace.findFirst({
              where,
              select: { id: true },
            }))
          )
            continue;
          const groups = new Map<
            number,
            ReturnType<typeof publicationNotificationChannel>[]
          >();
          for (const channel of channels) {
            const summary = summaries.get(channel.id);
            const days = summary?.bookedThroughDate
              ? Math.round(
                  (Date.parse(summary.bookedThroughDate) - Date.parse(today)) /
                    DAY,
                )
              : 0;
            const stage = summary?.hasPostsToday ? days : 0;
            if (stage !== 0 && stage !== 3) continue;
            const group = groups.get(stage) ?? [];
            group.push(publicationNotificationChannel(channel));
            groups.set(stage, group);
          }
          for (const [days, group] of groups) {
            for (let offset = 0; offset < group.length; offset += 15) {
              const batch = group.slice(offset, offset + 15);
              const hash = createHash('sha256')
                .update(batch.map(({ id }) => id).join(','))
                .digest('hex')
                .slice(0, 16);
              const lines = coverageNotificationLines(days, batch);
              const sourceKey = `publication-coverage:${today}:${days}:${hash}`;
              const telegram =
                workspace.coverageNotificationDestination !== 'IN_APP';
              const receiptKey = `${today}:${workspace.coverageNotificationDestination}:${days}:${hash}`;
              if (
                telegram &&
                workspace.coverageNotificationSentKeys.includes(receiptKey)
              )
                continue;
              const sent = await this.delivery.deliver({
                workspaceId: workspace.id,
                memberId: member.id,
                sourceKey,
                title: lines[0].text,
                destination: workspace.coverageNotificationDestination,
                body: batch.map(({ title }) => title).join('\n'),
                telegramHtml: publicationNotificationHtml(lines),
              });
              if (telegram && sent)
                await this.prisma.$executeRaw`
                UPDATE "Workspace"
                SET "coverageNotificationSentKeys" = ARRAY(
                  SELECT DISTINCT value
                  FROM unnest("coverageNotificationSentKeys" || ARRAY[${receiptKey}]::text[]) AS item(value)
                  WHERE left(value, 10) = ${today}
                )
                WHERE id = ${workspace.id}
              `;
            }
          }
        }
        await this.prisma.workspace.updateMany({
          where,
          data: { publicationNotificationDueAt: morningAfter(today, timezone) },
        });
      } catch (error) {
        deliveryFailure ??=
          error instanceof Error
            ? error
            : new Error('Publication notification delivery failed');
      }
    }
    notifyScheduledTaskDueWorkChanged(CHANNEL_REMINDERS_TASK_KEY);
    if (deliveryFailure) throw deliveryFailure;
    return { processed: workspaces.length };
  }
}
