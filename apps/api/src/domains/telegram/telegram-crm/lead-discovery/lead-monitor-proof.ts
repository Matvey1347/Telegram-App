import type { PrismaService } from '../../../../prisma/prisma.service';
import { acquirePostgresTransactionLock } from '../../../../prisma/postgres-advisory-lock';
import type { TelegramLeadTransportEvent } from '../../../../telegram/shared/mtproto/telegram-lead-transport-events';
export type WatchedLeadSource = {
  id: string;
  workspaceId: string;
  accountId: string | null;
  channelId: string | null;
  monitoringActorUserId: string;
  processingReference: string;
  gapMarkedAt?: Date;
};
/** Bounded ephemeral uncertainty markers; manual/automatic recovery share one proof boundary. */
export class LeadMonitorProof {
  readonly gaps = new Map<string, WatchedLeadSource>();
  readonly versions = new Map<string, number>();
  readonly uncertain = new Set<string>();
  private serial = 0;
  private readonly markers = new Map<string, WatchedLeadSource>();
  private readonly recoveries = new Map<
    string,
    { sourceId: string; version: number | undefined }
  >();
  mark(source: WatchedLeadSource) {
    const marker = { ...source, gapMarkedAt: new Date() };
    this.gaps.set(source.id, marker);
    this.markers.set(source.id, marker);
    this.uncertain.add(source.id);
    this.versions.set(source.id, ++this.serial);
  }
  recovered(id: string, version: number | undefined) {
    if (version !== this.versions.get(id)) {
      const newer = this.markers.get(id);
      if (newer) this.gaps.set(id, newer);
      return;
    }
    this.gaps.delete(id);
    this.versions.delete(id);
    this.uncertain.delete(id);
    this.markers.delete(id);
  }
  receive(event: TelegramLeadTransportEvent) {
    if (event.type === 'recovery.started') {
      if (this.recoveries.size >= 1000) {
        const oldest = [...this.recoveries.keys()][0];
        if (oldest) this.recoveries.delete(oldest);
      }
      this.recoveries.set(event.recoveryId, {
        sourceId: event.sourceId,
        version: this.versions.get(event.sourceId),
      });
      return true;
    }
    if (event.type === 'recovery.finished') {
      const pending = this.recoveries.get(event.recoveryId);
      this.recoveries.delete(event.recoveryId);
      if (pending && event.success)
        this.recovered(pending.sourceId, pending.version);
      return true;
    }
    return false;
  }
  retain(ids: Set<string>) {
    for (const id of this.uncertain)
      if (!ids.has(id)) {
        this.gaps.delete(id);
        this.versions.delete(id);
        this.uncertain.delete(id);
        this.markers.delete(id);
      }
  }
  clear() {
    this.gaps.clear();
    this.versions.clear();
    this.uncertain.clear();
    this.recoveries.clear();
    this.markers.clear();
  }
}
export async function persistLeadGaps(
  prisma: PrismaService,
  sources: WatchedLeadSource[],
  isCurrent: (id: string) => boolean = () => true,
) {
  const groups = new Map<string, WatchedLeadSource[]>();
  for (const source of sources)
    groups.set(source.workspaceId, [
      ...(groups.get(source.workspaceId) ?? []),
      { ...source, gapMarkedAt: source.gapMarkedAt ?? new Date() },
    ]);
  for (const [workspaceId, group] of groups)
    await prisma.$transaction(async (tx) => {
      await acquirePostgresTransactionLock(tx, `lead-discovery:${workspaceId}`);
      const current = group.filter((source) => isCurrent(source.id));
      if (!current.length) return;
      await tx.telegramLeadSource.updateMany({
        where: {
          workspaceId,
          id: { in: current.map((source) => source.id) },
          AND: [
            {
              OR: current.map((source) => ({
                id: source.id,
                accountId: source.accountId,
                channelId: source.channelId,
                processingReference: source.processingReference,
                monitoringActorUserId: source.monitoringActorUserId,
                OR: [
                  { coverageTo: null },
                  { coverageTo: { lte: source.gapMarkedAt } },
                ],
              })),
            },
          ],
          monitoringState: 'ACTIVE',
          OR: [
            { coverageState: { not: 'GAPPED' } },
            { coverageFrom: { not: null } },
          ],
        },
        data: { coverageState: 'GAPPED', coverageFrom: null },
      });
    });
}

export async function pauseIneligibleLeadSources(
  prisma: PrismaService,
  sources: WatchedLeadSource[],
): Promise<string[]> {
  const groups = new Map<string, WatchedLeadSource[]>(),
    paused: string[] = [];
  for (const source of sources)
    groups.set(source.workspaceId, [
      ...(groups.get(source.workspaceId) ?? []),
      source,
    ]);
  for (const [workspaceId, group] of groups)
    await prisma.$transaction(async (tx) => {
      await acquirePostgresTransactionLock(tx, `lead-discovery:${workspaceId}`);
      const rows = await tx.telegramLeadSource.updateManyAndReturn({
        where: {
          workspaceId,
          monitoringState: 'ACTIVE',
          OR: group.map((source) => ({
            id: source.id,
            accountId: source.accountId,
            channelId: source.channelId,
            processingReference: source.processingReference,
            monitoringActorUserId: source.monitoringActorUserId,
          })),
        },
        data: {
          monitoringState: 'PAUSED',
          coverageState: 'GAPPED',
          coverageFrom: null,
          lastErrorCode: 'LEAD_PROCESSING_REVIEW_REQUIRED',
          lastErrorAt: new Date(),
        },
        select: { id: true },
      });
      paused.push(...rows.map((row) => row.id));
    });
  return paused;
}
