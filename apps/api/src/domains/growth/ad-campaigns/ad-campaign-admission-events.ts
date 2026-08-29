import { createHash } from 'crypto';
import {
  AdCampaignAdmissionDetectionMode,
  AdCampaignAdmissionTimeBoundarySource,
  Prisma,
} from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';

export type AdmissionSourceLinkDelta = {
  telegramInviteLinkId: string;
  inviteLink: string;
  previousSnapshotAt: Date | null;
  currentSnapshotAt: Date;
  joinedBefore: number;
  joinedAfter: number;
  joinedDelta: number;
  requestedBefore: number;
  requestedAfter: number;
  createsJoinRequest: boolean;
};

export type AdmissionEvent = {
  adCampaignId: string;
  telegramChannelId: string;
  detectionMode: AdCampaignAdmissionDetectionMode;
  previousSnapshotAt: Date | null;
  currentSnapshotAt: Date;
  analysisStartedAt?: Date;
  timeBoundarySource?: AdCampaignAdmissionTimeBoundarySource;
  sourceLinks: AdmissionSourceLinkDelta[];
};

export type AdmissionCampaign = {
  id: string;
  telegramChannelId: string;
  startedAt: Date | null;
  placementDate: Date | null;
  createdAt: Date;
  inviteLinks: Array<{
    id: string;
    url: string;
    createsJoinRequest: boolean | null;
    createdAt: Date;
    telegramCreatedAt: Date | null;
  }>;
};

export type AdmissionInviteSnapshot = {
  inviteLinkId: string;
  syncedAt: Date;
  joinedCount: number;
  requestedCount: number;
};

type ScopedAdmissionInviteSnapshot = AdmissionInviteSnapshot & {
  adCampaignId: string | null;
};

export async function loadAdmissionInviteSnapshotsByCampaign(
  prisma: PrismaService,
  params: {
    workspaceId: string;
    telegramChannelId: string;
    campaignIds: string[];
    inviteLinkIds: string[];
    fromExclusive?: Date;
    toInclusive?: Date;
  },
) {
  const scope = {
    workspaceId: params.workspaceId,
    telegramChannelId: params.telegramChannelId,
    adCampaignId: { in: params.campaignIds },
    inviteLinkId: { in: params.inviteLinkIds },
  };
  const select = {
    adCampaignId: true,
    inviteLinkId: true,
    syncedAt: true,
    joinedCount: true,
    requestedCount: true,
  } as const;
  const rows: ScopedAdmissionInviteSnapshot[] = params.fromExclusive
    ? (
        await Promise.all([
          prisma.$queryRaw<ScopedAdmissionInviteSnapshot[]>(Prisma.sql`
            SELECT DISTINCT ON (snapshot."inviteLinkId")
              snapshot."adCampaignId",
              snapshot."inviteLinkId",
              snapshot."syncedAt",
              snapshot."joinedCount",
              snapshot."requestedCount"
            FROM "TelegramInviteLinkSnapshot" AS snapshot
            WHERE snapshot."workspaceId" = ${params.workspaceId}
              AND snapshot."telegramChannelId" = ${params.telegramChannelId}
              AND snapshot."adCampaignId" IN (${Prisma.join(params.campaignIds)})
              AND snapshot."inviteLinkId" IN (${Prisma.join(params.inviteLinkIds)})
              AND snapshot."syncedAt" <= ${params.fromExclusive}
            ORDER BY snapshot."inviteLinkId" ASC,
              snapshot."syncedAt" DESC,
              snapshot."id" DESC
          `),
          prisma.telegramInviteLinkSnapshot.findMany({
            where: {
              ...scope,
              syncedAt: {
                gt: params.fromExclusive,
                ...(params.toInclusive ? { lte: params.toInclusive } : {}),
              },
            },
            orderBy: [
              { adCampaignId: 'asc' },
              { inviteLinkId: 'asc' },
              { syncedAt: 'asc' },
            ],
            select,
          }),
        ])
      ).flat()
    : await prisma.telegramInviteLinkSnapshot.findMany({
        // Historical/backfill runs intentionally retain full-history behavior.
        where: {
          ...scope,
          ...(params.toInclusive
            ? { syncedAt: { lte: params.toInclusive } }
            : {}),
        },
        orderBy: [
          { adCampaignId: 'asc' },
          { inviteLinkId: 'asc' },
          { syncedAt: 'asc' },
        ],
        select,
      });

  rows.sort(
    (left, right) =>
      (left.adCampaignId ?? '').localeCompare(right.adCampaignId ?? '') ||
      left.inviteLinkId.localeCompare(right.inviteLinkId) ||
      left.syncedAt.getTime() - right.syncedAt.getTime(),
  );
  const grouped = new Map<string, AdmissionInviteSnapshot[]>();
  for (const row of rows) {
    if (!row.adCampaignId) continue;
    const snapshots = grouped.get(row.adCampaignId) ?? [];
    snapshots.push(row);
    grouped.set(row.adCampaignId, snapshots);
  }
  return grouped;
}

type GroupedEvent = {
  detectionMode: AdCampaignAdmissionDetectionMode;
  previousSnapshotAt: Date | null;
  currentSnapshotAt: Date;
  sourceLinks: AdmissionSourceLinkDelta[];
};

export function detectAdmissionEventsForCampaign(params: {
  campaign: AdmissionCampaign;
  snapshots: AdmissionInviteSnapshot[];
  fromExclusive?: Date;
}): AdmissionEvent[] {
  const linkById = new Map(
    params.campaign.inviteLinks.map((link) => [link.id, link]),
  );
  const groupedByLink = new Map<string, AdmissionInviteSnapshot[]>();
  for (const snapshot of params.snapshots) {
    const list = groupedByLink.get(snapshot.inviteLinkId) ?? [];
    list.push(snapshot);
    groupedByLink.set(snapshot.inviteLinkId, list);
  }

  const deltasByObservedAt = new Map<string, GroupedEvent>();
  for (const [inviteLinkId, rows] of groupedByLink.entries()) {
    const link = linkById.get(inviteLinkId);
    if (!link) continue;
    const createsJoinRequest = Boolean(link.createsJoinRequest);
    const first = rows[0];
    if (
      first &&
      Number(first.joinedCount || 0) > 0 &&
      createsJoinRequest &&
      (!params.fromExclusive || first.syncedAt > params.fromExclusive)
    ) {
      addDelta(deltasByObservedAt, {
        detectionMode: AdCampaignAdmissionDetectionMode.BOOTSTRAPPED_CUMULATIVE,
        previousSnapshotAt: null,
        currentSnapshotAt: first.syncedAt,
        sourceLinks: [
          {
            telegramInviteLinkId: inviteLinkId,
            inviteLink: link.url,
            previousSnapshotAt: null,
            currentSnapshotAt: first.syncedAt,
            joinedBefore: 0,
            joinedAfter: Number(first.joinedCount || 0),
            joinedDelta: Number(first.joinedCount || 0),
            requestedBefore: 0,
            requestedAfter: Number(first.requestedCount || 0),
            createsJoinRequest,
          },
        ],
      });
    }
    for (let index = 1; index < rows.length; index += 1) {
      const previous = rows[index - 1];
      const current = rows[index];
      if (params.fromExclusive && current.syncedAt <= params.fromExclusive) {
        continue;
      }
      const joinedDelta =
        Number(current.joinedCount || 0) - Number(previous.joinedCount || 0);
      if (joinedDelta <= 0) continue;
      if (!createsJoinRequest && Number(previous.requestedCount || 0) <= 0) {
        continue;
      }
      addDelta(deltasByObservedAt, {
        detectionMode: AdCampaignAdmissionDetectionMode.EXACT_DELTA,
        previousSnapshotAt: previous.syncedAt,
        currentSnapshotAt: current.syncedAt,
        sourceLinks: [
          {
            telegramInviteLinkId: inviteLinkId,
            inviteLink: link.url,
            previousSnapshotAt: previous.syncedAt,
            currentSnapshotAt: current.syncedAt,
            joinedBefore: Number(previous.joinedCount || 0),
            joinedAfter: Number(current.joinedCount || 0),
            joinedDelta,
            requestedBefore: Number(previous.requestedCount || 0),
            requestedAfter: Number(current.requestedCount || 0),
            createsJoinRequest,
          },
        ],
      });
    }
  }

  return [...deltasByObservedAt.values()]
    .sort(
      (a, b) => a.currentSnapshotAt.getTime() - b.currentSnapshotAt.getTime(),
    )
    .map((event) => {
      const bootstrapped =
        event.detectionMode ===
        AdCampaignAdmissionDetectionMode.BOOTSTRAPPED_CUMULATIVE;
      const boundary = bootstrapped
        ? resolveBootstrapBoundary(params.campaign, event.sourceLinks)
        : {
            analysisStartedAt: event.currentSnapshotAt,
            timeBoundarySource:
              AdCampaignAdmissionTimeBoundarySource.FIRST_INVITE_SNAPSHOT,
          };
      return {
        adCampaignId: params.campaign.id,
        telegramChannelId: params.campaign.telegramChannelId,
        ...event,
        ...boundary,
      };
    });
}

function addDelta(target: Map<string, GroupedEvent>, event: GroupedEvent) {
  const key = `${event.detectionMode}:${event.currentSnapshotAt.toISOString()}`;
  const current = target.get(key);
  if (current) {
    current.sourceLinks.push(...event.sourceLinks);
    if (
      event.previousSnapshotAt &&
      (!current.previousSnapshotAt ||
        event.previousSnapshotAt < current.previousSnapshotAt)
    ) {
      current.previousSnapshotAt = event.previousSnapshotAt;
    }
    return;
  }
  target.set(key, { ...event, sourceLinks: [...event.sourceLinks] });
}

function resolveBootstrapBoundary(
  campaign: AdmissionCampaign,
  sourceLinks: AdmissionSourceLinkDelta[],
) {
  if (campaign.startedAt) {
    return {
      analysisStartedAt: campaign.startedAt,
      timeBoundarySource:
        AdCampaignAdmissionTimeBoundarySource.CAMPAIGN_ACTUAL_START,
    };
  }
  if (campaign.placementDate) {
    return {
      analysisStartedAt: campaign.placementDate,
      timeBoundarySource: AdCampaignAdmissionTimeBoundarySource.CAMPAIGN_START,
    };
  }
  const ids = new Set(sourceLinks.map((link) => link.telegramInviteLinkId));
  const linkCreatedAt = campaign.inviteLinks
    .filter((link) => ids.has(link.id))
    .map((link) => link.telegramCreatedAt ?? link.createdAt)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  if (linkCreatedAt) {
    return {
      analysisStartedAt: linkCreatedAt,
      timeBoundarySource:
        AdCampaignAdmissionTimeBoundarySource.INVITE_LINK_CREATED,
    };
  }
  return {
    analysisStartedAt: sourceLinks[0].currentSnapshotAt,
    timeBoundarySource:
      AdCampaignAdmissionTimeBoundarySource.FIRST_INVITE_SNAPSHOT,
  };
}

export function admissionBatchFingerprint(
  campaignId: string,
  event: AdmissionEvent,
) {
  const payload = JSON.stringify({
    campaignId,
    detectionMode: event.detectionMode,
    previousSnapshotAt: event.previousSnapshotAt?.toISOString() ?? null,
    currentSnapshotAt: event.currentSnapshotAt.toISOString(),
    sourceLinks: event.sourceLinks
      .map((link) => ({
        telegramInviteLinkId: link.telegramInviteLinkId,
        joinedDelta: link.joinedDelta,
        joinedBefore: link.joinedBefore,
        joinedAfter: link.joinedAfter,
        requestedBefore: link.requestedBefore,
        requestedAfter: link.requestedAfter,
      }))
      .sort((a, b) =>
        a.telegramInviteLinkId.localeCompare(b.telegramInviteLinkId),
      ),
  });
  return createHash('sha256').update(payload).digest('hex');
}
