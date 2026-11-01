import { Prisma } from '@prisma/client';
import type { TelegramLeadPolicy } from './lead-policy.service';
import type { LeadIngestEvent } from './lead-ingest.service';
import type { LeadRecoveryCheckpoint } from './lead-ingest-coverage';
import { leadTransportMatches } from './lead-transport-snapshot';
/** Lock source bindings before reading eligibility; all source UPDATEs serialize on these rows. */
export async function loadLeadIngestSources(
  tx: Prisma.TransactionClient,
  policy: TelegramLeadPolicy,
  workspaceId: string,
  events: LeadIngestEvent[],
  allowPaused: boolean,
  recovery?: LeadRecoveryCheckpoint,
) {
  const ids = [
    ...new Set([
      ...events.map((event) => event.sourceId),
      ...(recovery ? [recovery.sourceId] : []),
    ]),
  ];
  await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT id FROM "TelegramLeadSource" WHERE "workspaceId"=${workspaceId} AND id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`,
  );
  const sources = await tx.telegramLeadSource.findMany({
      where: { workspaceId, id: { in: ids } },
    }),
    sourceMap = new Map(sources.map((source) => [source.id, source]));
  const telegram = sources.filter(
    (source) => source.type === 'TELEGRAM_CHANNEL',
  );
  const own = telegram.length
    ? await tx.telegramChannel.findMany({
        where: {
          workspaceId,
          OR: [
            {
              telegramChatId: {
                in: telegram.flatMap((source) =>
                  source.channelId
                    ? [source.channelId, `-100${source.channelId}`]
                    : [],
                ),
              },
            },
            {
              username: {
                in: telegram.flatMap((source) =>
                  source.username ? [source.username] : [],
                ),
                mode: 'insensitive',
              },
            },
          ],
        },
        select: { telegramChatId: true, username: true },
      })
    : [];
  const eligible = new Map(
    sources
      .filter((source) => {
        try {
          policy.assertProcessing(source, 'ingest', !allowPaused);
          const owned = own.some(
            (channel) =>
              (channel.telegramChatId?.replace(/^-100/, '') ===
                source.channelId &&
                source.channelId !== null) ||
              (channel.username?.toLowerCase() ===
                source.username?.toLowerCase() &&
                source.username !== null),
          );
          return !owned || source.allowOwnChannel;
        } catch {
          return false;
        }
      })
      .map((source) => [source.id, source]),
  );
  const snapshotMatches = (event: LeadIngestEvent) =>
    leadTransportMatches(
      sourceMap.get(event.sourceId),
      event.expectedTransport,
    );
  const recoverySource = recovery
    ? sourceMap.get(recovery.sourceId)
    : undefined;
  const recoveryMatches =
    !recovery ||
    Boolean(
      recoverySource &&
      leadTransportMatches(recoverySource, recovery.expectedTransport) &&
      recoverySource.channelPts === recovery.startingPts &&
      Number.isSafeInteger(recovery.pts) &&
      recovery.pts >= recovery.startingPts &&
      (!recovery.capturedAt ||
        !recoverySource.coverageTo ||
        recovery.capturedAt >= recoverySource.coverageTo),
    );
  const staleLive = (event: LeadIngestEvent) =>
    event.pts !== undefined &&
    sourceMap.get(event.sourceId)?.channelPts !== null &&
    event.pts <= (sourceMap.get(event.sourceId)?.channelPts ?? -1);
  const matches = (event: LeadIngestEvent) =>
    snapshotMatches(event) &&
    (!recovery || event.sourceId !== recovery.sourceId || recoveryMatches) &&
    !staleLive(event);
  const freshIds = new Set([
    ...events.filter(matches).map((event) => event.sourceId),
    ...(recovery && recoveryMatches ? [recovery.sourceId] : []),
  ]);
  const blockedSourceIds = ids.filter(
    (id) => freshIds.has(id) && !eligible.has(id),
  );
  return {
    eligible,
    matches,
    staleLive,
    blockedSourceIds,
    recoveryMatches,
    transportGap:
      !recoveryMatches || events.some((event) => !snapshotMatches(event)),
  };
}
