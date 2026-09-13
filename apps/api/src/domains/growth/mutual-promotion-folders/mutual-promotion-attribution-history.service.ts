import { Injectable } from '@nestjs/common';
import type { MutualPromotionAttributionHistory } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';

type HistoryParticipant = {
  id: string;
  role: 'PUBLISHER' | 'PAID';
  telegramChannelId: string;
  inviteLinkId: string;
  subscribersAtStart: number | null;
  subscribersAtEnd: number | null;
  inviteJoinedAtStart: number | null;
  inviteJoinedAtEnd: number | null;
  baselineCapturedAt: Date | null;
  finalCapturedAt: Date | null;
  telegramChannel: { currentSubscribersCount: number | null };
  inviteLink: { joinedCount: number };
};

type CounterEvent = {
  at: Date;
  inviteJoined?: number;
  subscribers?: number;
};

const MAX_HISTORY_ROWS = 5_000;

@Injectable()
export class MutualPromotionAttributionHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async load(input: {
    workspaceId: string;
    folderId: string;
    folderStartsAt: Date;
    participants: HistoryParticipant[];
  }): Promise<Map<string, MutualPromotionAttributionHistory>> {
    if (!input.participants.length) return new Map();
    const nextFolder = await this.prisma.mutualPromotionFolder.findFirst({
      where: {
        workspaceId: input.workspaceId,
        id: { not: input.folderId },
        status: { not: 'CANCELLED' },
        startsAt: { gt: input.folderStartsAt },
      },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      select: { startsAt: true },
    });
    const now = new Date();
    const endsAt = nextFolder?.startsAt ?? now;
    const startsAt = input.participants.reduce(
      (earliest, participant) =>
        participant.baselineCapturedAt &&
        participant.baselineCapturedAt < earliest
          ? participant.baselineCapturedAt
          : earliest,
      input.folderStartsAt,
    );
    const publisherChannelIds = input.participants
      .filter((participant) => participant.role === 'PUBLISHER')
      .map((participant) => participant.telegramChannelId);
    const [inviteSnapshots, audienceSnapshots] = await Promise.all([
      this.prisma.telegramInviteLinkSnapshot.findMany({
        where: {
          workspaceId: input.workspaceId,
          inviteLinkId: {
            in: input.participants.map(
              (participant) => participant.inviteLinkId,
            ),
          },
          syncedAt: { gte: startsAt, lte: endsAt },
        },
        orderBy: [{ syncedAt: 'asc' }, { id: 'asc' }],
        take: MAX_HISTORY_ROWS,
        select: { inviteLinkId: true, syncedAt: true, joinedCount: true },
      }),
      publisherChannelIds.length
        ? this.prisma.telegramChannelAudienceSnapshot.findMany({
            where: {
              workspaceId: input.workspaceId,
              telegramChannelId: { in: publisherChannelIds },
              collectedAt: { gte: startsAt, lte: endsAt },
              subscribersCount: { not: null },
            },
            orderBy: [{ collectedAt: 'asc' }, { id: 'asc' }],
            take: MAX_HISTORY_ROWS,
            select: {
              telegramChannelId: true,
              collectedAt: true,
              subscribersCount: true,
            },
          })
        : Promise.resolve([]),
    ]);
    const inviteEvents = new Map<string, CounterEvent[]>();
    for (const row of inviteSnapshots) {
      const events = inviteEvents.get(row.inviteLinkId) ?? [];
      events.push({ at: row.syncedAt, inviteJoined: row.joinedCount });
      inviteEvents.set(row.inviteLinkId, events);
    }
    const audienceEvents = new Map<string, CounterEvent[]>();
    for (const row of audienceSnapshots) {
      const events = audienceEvents.get(row.telegramChannelId) ?? [];
      events.push({
        at: row.collectedAt,
        subscribers: row.subscribersCount ?? undefined,
      });
      audienceEvents.set(row.telegramChannelId, events);
    }

    return new Map(
      input.participants.map((participant) => {
        const participantStart =
          participant.baselineCapturedAt ?? input.folderStartsAt;
        const events: CounterEvent[] = [
          { at: participantStart },
          ...(inviteEvents.get(participant.inviteLinkId) ?? []),
          ...(audienceEvents.get(participant.telegramChannelId) ?? []),
        ];
        if (
          participant.finalCapturedAt &&
          participant.finalCapturedAt <= endsAt
        ) {
          events.push({
            at: participant.finalCapturedAt,
            inviteJoined: participant.inviteJoinedAtEnd ?? undefined,
            subscribers: participant.subscribersAtEnd ?? undefined,
          });
        }
        if (!nextFolder) {
          events.push({
            at: endsAt,
            inviteJoined: participant.inviteLink.joinedCount,
            subscribers:
              participant.telegramChannel.currentSubscribersCount ?? undefined,
          });
        } else {
          // Keep the visible series aligned with the complete attribution window,
          // even when the last stored snapshot predates the next folder.
          events.push({ at: endsAt });
        }
        events.sort((left, right) => left.at.getTime() - right.at.getTime());
        const mergedEvents: CounterEvent[] = [];
        for (const event of events) {
          const previous = mergedEvents.at(-1);
          if (previous?.at.getTime() === event.at.getTime()) {
            previous.inviteJoined = event.inviteJoined ?? previous.inviteJoined;
            previous.subscribers = event.subscribers ?? previous.subscribers;
          } else {
            mergedEvents.push({ ...event });
          }
        }

        let inviteJoined = participant.inviteJoinedAtStart;
        let subscribers = participant.subscribersAtStart;
        const hasInviteBaseline = inviteJoined != null;
        const hasAudienceBaseline = subscribers != null;
        const points = hasInviteBaseline
          ? mergedEvents.map((event) => {
              inviteJoined = event.inviteJoined ?? inviteJoined;
              subscribers = event.subscribers ?? subscribers;
              const joinedCount = Math.max(
                0,
                (inviteJoined ?? participant.inviteJoinedAtStart ?? 0) -
                  (participant.inviteJoinedAtStart ?? 0),
              );
              const audienceDelta =
                participant.role === 'PUBLISHER' && hasAudienceBaseline
                  ? (subscribers ?? participant.subscribersAtStart ?? 0) -
                    (participant.subscribersAtStart ?? 0)
                  : null;
              return {
                at: event.at.toISOString(),
                joinedCount,
                audienceDelta,
                unsubscribedCount:
                  audienceDelta == null
                    ? null
                    : Math.max(0, joinedCount - audienceDelta),
              };
            })
          : [];

        return [
          participant.id,
          {
            startsAt: participantStart.toISOString(),
            endsAt: endsAt.toISOString(),
            endsAtSource: nextFolder ? 'NEXT_FOLDER' : 'CURRENT_TIME',
            points,
          },
        ];
      }),
    );
  }
}
