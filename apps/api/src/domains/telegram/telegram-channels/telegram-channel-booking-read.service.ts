import { Injectable } from '@nestjs/common';
import {
  TelegramManagedPostOrigin,
  TelegramManagedPostStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export type TelegramChannelBookingSummary = {
  futureScheduledTotal: number;
  draftTotal: number;
  pendingJoinRequests: number;
  lastScheduledAt: string | null;
  nextAvailableDate: string;
  bookedThroughDate: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const BOOKING_LOOKAHEAD_DAYS = 370;

function createDateKeyFormatter(timezone: string) {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }
  return (value: Date) => {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(value)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    );
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
}

function addCalendarDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isStandaloneSubscriptionEnding(post: {
  origin: TelegramManagedPostOrigin;
  remoteImportKey: string | null;
  title: string;
  text: string | null;
  imageUrls: string[];
  buttonRows: unknown;
}) {
  if (
    post.origin !== TelegramManagedPostOrigin.TELEGRAM ||
    !post.remoteImportKey ||
    post.imageUrls.length > 0 ||
    (Array.isArray(post.buttonRows)
      ? post.buttonRows.length > 0
      : post.buttonRows != null)
  ) {
    return false;
  }
  const content = (post.text || post.title).trim();
  return (
    content.length <= 180 &&
    /(?:https?:\/\/)?t\.me\//iu.test(content) &&
    /(?:підпиш|подпиш|subscribe|приєднуй|присоедин)/iu.test(content)
  );
}

@Injectable()
export class TelegramChannelBookingReadService {
  constructor(private readonly prisma: PrismaService) {}

  async summariesForChannels(
    workspaceId: string,
    channelIds: string[],
    now = new Date(),
    pendingJoinRequestsByChannel: ReadonlyMap<string, number> = new Map(),
  ) {
    if (!channelIds.length) {
      return new Map<string, TelegramChannelBookingSummary>();
    }

    const horizon = new Date(now.getTime() + BOOKING_LOOKAHEAD_DAYS * DAY_MS);
    const [workspace, posts, draftCounts] = await Promise.all([
      this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { timezone: true },
      }),
      this.prisma.telegramManagedPost.findMany({
        where: {
          workspaceId,
          telegramChannelId: { in: channelIds },
          status: TelegramManagedPostStatus.SCHEDULED,
          scheduledAt: { gt: now, lte: horizon },
        },
        select: {
          telegramChannelId: true,
          scheduledAt: true,
          origin: true,
          remoteImportKey: true,
          title: true,
          text: true,
          imageUrls: true,
          buttonRows: true,
        },
        orderBy: { scheduledAt: 'asc' },
      }),
      this.prisma.telegramManagedPost.groupBy({
        by: ['telegramChannelId'],
        where: {
          workspaceId,
          telegramChannelId: { in: channelIds },
          status: TelegramManagedPostStatus.DRAFT,
        },
        _count: { _all: true },
      }),
    ]);
    const timezone = workspace?.timezone || 'UTC';
    const toDateKey = createDateKeyFormatter(timezone);
    const firstPlanningDate = addCalendarDays(toDateKey(now), 1);
    const postsByChannel = new Map<string, typeof posts>();
    const draftTotalByChannel = new Map(
      draftCounts.map((row) => [row.telegramChannelId, row._count._all]),
    );
    for (const post of posts) {
      if (isStandaloneSubscriptionEnding(post)) continue;
      const rows = postsByChannel.get(post.telegramChannelId) ?? [];
      rows.push(post);
      postsByChannel.set(post.telegramChannelId, rows);
    }

    return new Map(
      channelIds.map((channelId) => {
        const channelPosts = postsByChannel.get(channelId) ?? [];
        const occupiedDates = new Set(
          channelPosts.flatMap((post) =>
            post.scheduledAt ? [toDateKey(post.scheduledAt)] : [],
          ),
        );
        let nextAvailableDate = firstPlanningDate;
        for (let offset = 0; offset < BOOKING_LOOKAHEAD_DAYS; offset += 1) {
          const candidate = addCalendarDays(firstPlanningDate, offset);
          if (!occupiedDates.has(candidate)) {
            nextAvailableDate = candidate;
            break;
          }
        }
        const bookedThroughDate =
          nextAvailableDate === firstPlanningDate
            ? null
            : addCalendarDays(nextAvailableDate, -1);
        const lastScheduledAt = channelPosts.at(-1)?.scheduledAt ?? null;
        return [
          channelId,
          {
            futureScheduledTotal: channelPosts.length,
            draftTotal: draftTotalByChannel.get(channelId) ?? 0,
            pendingJoinRequests:
              pendingJoinRequestsByChannel.get(channelId) ?? 0,
            lastScheduledAt: lastScheduledAt?.toISOString() ?? null,
            nextAvailableDate,
            bookedThroughDate,
          },
        ];
      }),
    );
  }
}
