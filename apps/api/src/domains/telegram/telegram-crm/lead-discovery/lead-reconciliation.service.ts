import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { acquirePostgresTransactionLock } from '../../../../prisma/postgres-advisory-lock';
import { TelegramLeadPolicy } from './lead-policy.service';
import {
  enqueueLeadAnalysisHints,
  preflightLeadAnalysisHints,
} from './lead-analysis-outbox';
import { loadLeadIngestSources } from './lead-ingest-sources';

const PAGE_SIZE = 100;
/** Explicit calls only: no timer, provider call, dispatcher or background wake. */
@Injectable()
export class TelegramLeadReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TelegramLeadPolicy,
  ) {}

  async setEnabled(userId: string, sourceId: string, enabled: boolean) {
    await this.policy.refresh(userId);
    const source = await this.policy.source(userId, sourceId, 'manage');
    if (enabled) {
      const access = await this.policy.access(userId, 'analyze');
      if (
        access.workspaceId !== source.workspaceId ||
        source.monitoringActorUserId !== userId
      )
        throw new ForbiddenException('LEAD_AUTOMATION_ACTOR_MISMATCH');
      this.policy.assertProcessing(source, 'ai', true);
    }
    return this.prisma.$transaction(async (tx) => {
      await acquirePostgresTransactionLock(
        tx,
        `lead-discovery:${source.workspaceId}`,
      );
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "TelegramLeadSource" WHERE "workspaceId"=${source.workspaceId} AND id=${sourceId} FOR UPDATE`,
      );
      const current = await tx.telegramLeadSource.findFirst({
        where: { id: sourceId, workspaceId: source.workspaceId },
      });
      if (
        !current ||
        current.bindingRevision !== source.bindingRevision ||
        current.monitoringActorUserId !== source.monitoringActorUserId
      )
        throw new ConflictException('LEAD_SOURCE_CHANGED');
      if (enabled) this.policy.assertProcessing(current, 'ai', true);
      const key = {
        sourceId_workspaceId: { sourceId, workspaceId: source.workspaceId },
      };
      const old = await tx.telegramLeadAutoConfig.findUnique({ where: key });
      if ((old?.enabled ?? false) === enabled) return old;
      const reset = {
        reconcileNeeded: enabled,
        reconcileCursorObservedAt: null,
        reconcileCursorId: null,
        reconcileSnapshotObservedAt: null,
        reconcileSnapshotId: null,
        reconcileRunningGeneration: null,
      };
      return tx.telegramLeadAutoConfig.upsert({
        where: key,
        create: {
          sourceId,
          workspaceId: source.workspaceId,
          enabled,
          ...reset,
          reconcileGeneration: 1,
        },
        update: { enabled, ...reset, reconcileGeneration: { increment: 1 } },
      });
    });
  }

  async reconcilePage(userId: string, sourceId: string) {
    const initial = await this.policy.source(userId, sourceId, 'analyze');
    const workspaceId = initial.workspaceId;
    const allowed = await preflightLeadAnalysisHints(
      this.prisma,
      this.policy,
      workspaceId,
      userId,
      [sourceId],
    );
    if (!allowed.has(sourceId))
      throw new ForbiddenException('LEAD_AUTOMATION_NOT_AUTHORIZED');
    return this.prisma.$transaction(async (tx) => {
      await acquirePostgresTransactionLock(tx, `lead-discovery:${workspaceId}`);
      const gate = await loadLeadIngestSources(
        tx,
        this.policy,
        workspaceId,
        [
          {
            sourceId,
            material: {
              externalMessageId: '0',
              text: '',
              publishedAt: new Date().toISOString(),
            },
          },
        ],
        false,
      );
      const source = gate.eligible.get(sourceId);
      if (
        !source ||
        source.bindingRevision !== initial.bindingRevision ||
        source.monitoringActorUserId !== userId
      )
        throw new ConflictException('LEAD_SOURCE_CHANGED');
      this.policy.assertProcessing(source, 'ai', true);
      const key = { sourceId_workspaceId: { sourceId, workspaceId } };
      const config = await tx.telegramLeadAutoConfig.findUnique({ where: key });
      if (!config?.enabled || !config.reconcileNeeded)
        return { processed: 0, complete: true, blocked: false };
      const startNew = config.reconcileRunningGeneration === null;
      const upper = startNew
        ? await tx.telegramLeadObservation.findFirst({
            where: {
              workspaceId,
              sourceId,
              originalStatus: 'OBSERVED',
              expiresAt: { gt: new Date() },
            },
            orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
            select: { id: true, observedAt: true },
          })
        : config.reconcileSnapshotId && config.reconcileSnapshotObservedAt
          ? {
              id: config.reconcileSnapshotId,
              observedAt: config.reconcileSnapshotObservedAt,
            }
          : null;
      const generation = startNew
        ? config.reconcileGeneration
        : config.reconcileRunningGeneration;
      const cursor = startNew
        ? null
        : config.reconcileCursorId && config.reconcileCursorObservedAt
          ? {
              id: config.reconcileCursorId,
              observedAt: config.reconcileCursorObservedAt,
            }
          : null;
      const rows = upper
        ? await tx.telegramLeadObservation.findMany({
            where: {
              workspaceId,
              sourceId,
              originalStatus: 'OBSERVED',
              expiresAt: { gt: new Date() },
              AND: [
                {
                  OR: [
                    { observedAt: { lt: upper.observedAt } },
                    { observedAt: upper.observedAt, id: { lte: upper.id } },
                  ],
                },
                ...(cursor
                  ? [
                      {
                        OR: [
                          { observedAt: { gt: cursor.observedAt } },
                          {
                            observedAt: cursor.observedAt,
                            id: { gt: cursor.id },
                          },
                        ],
                      },
                    ]
                  : []),
              ],
            },
            orderBy: [{ observedAt: 'asc' }, { id: 'asc' }],
            take: PAGE_SIZE,
            select: {
              id: true,
              externalMessageId: true,
              contentHash: true,
              observedAt: true,
            },
          })
        : [];
      await enqueueLeadAnalysisHints(
        tx,
        this.policy,
        workspaceId,
        userId,
        allowed,
        new Map([[sourceId, source]]),
        rows.map((row) => ({
          sourceId,
          externalMessageId: row.externalMessageId,
          hash: row.contentHash,
          deleted: false,
          contentChanged: true,
          existed: false,
        })),
        true,
      );
      const queued = rows.length
        ? await tx.telegramLeadAnalysisQueue.findMany({
            where: {
              workspaceId,
              sourceId,
              bindingRevision: source.bindingRevision,
              observationId: { in: rows.map((r) => r.id) },
            },
            select: { observationId: true, contentHash: true },
          })
        : [];
      const keys = new Set(
        queued.map((row) => `${row.observationId}:${row.contentHash}`),
      );
      const blocked = rows.some(
        (row) => !keys.has(`${row.id}:${row.contentHash}`),
      );
      const current = await tx.telegramLeadAutoConfig.findUniqueOrThrow({
        where: key,
      });
      const last = rows.at(-1);
      const complete =
        !blocked &&
        rows.length < PAGE_SIZE &&
        current.reconcileGeneration === generation;
      const restart =
        !blocked &&
        rows.length < PAGE_SIZE &&
        current.reconcileGeneration !== generation;
      const data = {
        reconcileNeeded: !complete,
        reconcileRunningGeneration: complete || restart ? null : generation,
        reconcileSnapshotObservedAt:
          complete || restart ? null : (upper?.observedAt ?? null),
        reconcileSnapshotId: complete || restart ? null : (upper?.id ?? null),
        reconcileCursorObservedAt:
          complete || restart
            ? null
            : blocked
              ? (cursor?.observedAt ?? null)
              : (last?.observedAt ?? null),
        reconcileCursorId:
          complete || restart
            ? null
            : blocked
              ? (cursor?.id ?? null)
              : (last?.id ?? null),
        ...(complete ? { overflowedAt: null } : {}),
      };
      const sameDate = (a: Date | null, b: Date | null) =>
        a?.getTime() === b?.getTime();
      if (
        current.reconcileNeeded !== data.reconcileNeeded ||
        current.reconcileRunningGeneration !==
          data.reconcileRunningGeneration ||
        current.reconcileSnapshotId !== data.reconcileSnapshotId ||
        current.reconcileCursorId !== data.reconcileCursorId ||
        !sameDate(
          current.reconcileSnapshotObservedAt,
          data.reconcileSnapshotObservedAt,
        ) ||
        !sameDate(
          current.reconcileCursorObservedAt,
          data.reconcileCursorObservedAt,
        ) ||
        (complete && current.overflowedAt !== null)
      ) {
        await tx.telegramLeadAutoConfig.update({ where: key, data });
      }
      return { processed: blocked ? 0 : rows.length, complete, blocked };
    });
  }
}
