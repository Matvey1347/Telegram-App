import {
  leadTransportMatches,
  type LeadTransportSnapshot,
} from './lead-transport-snapshot';
import { Prisma, type TelegramLeadSource } from '@prisma/client';
import type { LeadIngestEvent } from './lead-ingest.service';
export type LeadRecoveryCheckpoint = {
  sourceId: string;
  startingPts: number;
  pts: number;
  complete: boolean;
  expectedTransport?: LeadTransportSnapshot;
  capturedAt?: Date;
};
/** Pure checkpoint preparation; caller holds the workspace lock and commits with posts. */
export function leadCoverageUpdate(
  source: TelegramLeadSource,
  events: LeadIngestEvent[],
  changed: boolean,
  recovery?: LeadRecoveryCheckpoint,
  now = new Date(),
) {
  if (
    recovery &&
    (!leadTransportMatches(source, recovery.expectedTransport) ||
      source.channelPts !== recovery.startingPts ||
      !Number.isSafeInteger(recovery.pts) ||
      recovery.pts < recovery.startingPts ||
      (recovery.capturedAt &&
        source.coverageTo &&
        recovery.capturedAt < source.coverageTo))
  )
    return { gap: true, sql: undefined };
  let pts = source.channelPts,
    coverageState = source.coverageState,
    coverageFrom = source.coverageFrom,
    coverageTo = source.coverageTo,
    gap = false;
  for (const event of [...events].sort((a, b) => (a.pts ?? 0) - (b.pts ?? 0))) {
    const captured = event.capturedAt ?? now;
    if (event.gap) {
      gap = true;
      coverageState = 'GAPPED';
      coverageFrom = null;
    }
    if (event.pts === undefined) continue;
    if (
      !Number.isSafeInteger(event.pts) ||
      !Number.isSafeInteger(event.ptsCount) ||
      (event.ptsCount ?? -1) < 0 ||
      event.pts < 0
    ) {
      gap = true;
      coverageState = 'GAPPED';
      coverageFrom = null;
      continue;
    }
    if (pts === null && !gap) {
      coverageFrom = captured;
      coverageState = 'CONTINUOUS';
    } else if (
      pts !== null &&
      event.pts - (event.ptsCount ?? 0) === pts &&
      coverageState === 'UNPROVEN' &&
      !gap
    ) {
      coverageFrom = captured;
      coverageState = 'CONTINUOUS';
    } else if (
      pts !== null &&
      event.pts > pts &&
      event.pts - (event.ptsCount ?? 0) !== pts
    ) {
      gap = true;
      coverageState = 'GAPPED';
      coverageFrom = null;
    }
    const next = Math.max(pts ?? 0, event.pts);
    if (next !== pts) coverageTo = captured;
    pts = next;
  }
  if (recovery) {
    const captured = recovery.capturedAt ?? now;
    if (
      source.channelPts !== recovery.startingPts ||
      !Number.isSafeInteger(recovery.pts) ||
      recovery.pts < recovery.startingPts
    ) {
      gap = true;
    } else if (!recovery.complete) {
      gap = true;
      coverageState = 'GAPPED';
      coverageFrom = null;
    } else {
      pts = recovery.pts;
      coverageState = 'CONTINUOUS';
      coverageFrom =
        source.coverageState === 'CONTINUOUS' && !gap
          ? (source.coverageFrom ?? captured)
          : captured;
      coverageTo = captured;
    }
  }
  const checkpoint = Math.max(
    source.checkpointMessageId ?? 0,
    ...events.map((event) =>
      /^\d+$/.test(event.material.externalMessageId)
        ? Math.min(2147483647, Number(event.material.externalMessageId))
        : 0,
    ),
  );
  const recovered = Boolean(
    recovery?.complete &&
    source.channelPts === recovery.startingPts &&
    Number.isSafeInteger(recovery.pts) &&
    recovery.pts >= recovery.startingPts,
  );
  const capturedObservedAt = recovered
    ? (recovery!.capturedAt ?? now)
    : events.reduce(
        (latest, event) =>
          event.capturedAt && event.capturedAt > latest
            ? event.capturedAt
            : latest,
        events.length ? (events[0].capturedAt ?? now) : now,
      );
  const observedAt =
    source.lastObservedAt && source.lastObservedAt > capturedObservedAt
      ? source.lastObservedAt
      : capturedObservedAt;
  const differs =
    changed ||
    (recovered && source.lastObservedAt?.getTime() !== observedAt.getTime()) ||
    pts !== source.channelPts ||
    coverageState !== source.coverageState ||
    coverageTo?.getTime() !== source.coverageTo?.getTime() ||
    checkpoint !== (source.checkpointMessageId ?? 0);
  const sql = differs
    ? Prisma.sql`(${source.id},${changed || recovered ? observedAt : source.lastObservedAt}::timestamp,${pts}::int,${coverageState},${coverageFrom}::timestamp,${coverageTo}::timestamp,${checkpoint}::int)`
    : undefined;
  return { sql, gap };
}
