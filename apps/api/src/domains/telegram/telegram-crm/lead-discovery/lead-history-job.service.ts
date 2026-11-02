import { ConflictException, Injectable, Optional } from '@nestjs/common';
import type { TelegramLeadHistoryJob } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type {
  LeadHistoryJob,
  LeadPipelineProgress,
} from '@telegram-system/shared';
import { PrismaService } from '../../../../prisma/prisma.service';
import { acquirePostgresTransactionLock } from '../../../../prisma/postgres-advisory-lock';
import { TelegramLeadPolicy } from './lead-policy.service';
import { TelegramLeadHistoryWorker } from './lead-history-worker.service';
import { TelegramLeadAnalysisExecutor } from './lead-analysis-executor.service';
import { TelegramLeadReconciliationService } from './lead-reconciliation.service';
import { TelegramCrmRuntimeManager } from '../telegram-crm-runtime-manager.service';

export function historyJobView(job: TelegramLeadHistoryJob): LeadHistoryJob {
  return {
    sourceId: job.sourceId,
    phase: 'HISTORY_COLLECTION_ONLY' as const,
    status: (['RUNNING', 'PAUSING', 'PAUSED', 'COMPLETED', 'FAILED'].includes(
      job.status,
    )
      ? job.status
      : 'FAILED') as LeadHistoryJob['status'],
    cutoffAt: job.cutoffAt.toISOString(),
    pages: job.pages,
    received: job.received,
    coverage: job.hasGaps ? 'GAPPED' : 'UNPROVEN',
    lastErrorCode: job.lastErrorCode,
    startedAt: job.startedAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class TelegramLeadHistoryJobService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TelegramLeadPolicy,
    private readonly worker: TelegramLeadHistoryWorker,
    private readonly runtime: TelegramCrmRuntimeManager,
    @Optional()
    private readonly reconciliation?: TelegramLeadReconciliationService,
    @Optional() private readonly executor?: TelegramLeadAnalysisExecutor,
  ) {}

  async status(userId: string, sourceId: string) {
    const source = await this.policy.source(userId, sourceId, 'view');
    const job = await this.prisma.telegramLeadHistoryJob.findUnique({
      where: {
        sourceId_workspaceId: { sourceId, workspaceId: source.workspaceId },
      },
    });
    return job ? historyJobView(job) : null;
  }

  async progress(
    userId: string,
    sourceId: string,
  ): Promise<LeadPipelineProgress> {
    const source = await this.policy.source(userId, sourceId, 'view');
    const where = { workspaceId: source.workspaceId, sourceId };
    const [job, config, counts, admitted] = await Promise.all([
      this.prisma.telegramLeadHistoryJob.findUnique({
        where: { sourceId_workspaceId: where },
      }),
      this.prisma.telegramLeadAutoConfig.findUnique({
        where: { sourceId_workspaceId: where },
        select: { enabled: true, reconcileNeeded: true },
      }),
      this.prisma.telegramLeadAnalysisQueue.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT count(*)::bigint AS count FROM "AiOperation" a
        JOIN "TelegramLeadObservation" o ON o.id=a."businessObjectId" AND o."workspaceId"=a."workspaceId"
        WHERE a."workspaceId"=${source.workspaceId} AND o."sourceId"=${sourceId}
          AND a.mode='AUTOMATIC' AND a.status='RUNNING'
          AND a.category IN ('LEAD_AD_CLASSIFICATION', 'LEAD_CONTACT_EXTRACTION')`),
    ]);
    const analysis: LeadPipelineProgress['analysis'] = {
      waiting: 0,
      running: 0,
      completed: 0,
      needsMetadata: 0,
      needsMediaAnalysis: 0,
      failed: 0,
      unknown: 0,
      other: 0,
    };
    const keys: Record<string, keyof typeof analysis> = {
      WAIT_AUTH_RECHECK: 'waiting',
      RUNNING: 'running',
      COMPLETED: 'completed',
      NEEDS_METADATA: 'needsMetadata',
      NEEDS_MEDIA_ANALYSIS: 'needsMediaAnalysis',
      FAILED: 'failed',
      UNKNOWN: 'unknown',
    };
    for (const row of counts)
      analysis[keys[row.status] ?? 'other'] += row._count._all;
    return {
      collection: job ? historyJobView(job) : null,
      analysisEnabled: config?.enabled ?? false,
      reconciliationPending: config?.reconcileNeeded ?? false,
      admittedAiOperations: Number(admitted[0]?.count ?? 0),
      analysis,
    };
  }

  async start(userId: string, sourceId: string) {
    const source = await this.policy.source(userId, sourceId, 'manage');
    this.policy.assertProcessing(source, 'ingest', false);
    if (!source.accountId || !source.channelId)
      throw new ConflictException('LEAD_VALIDATE_SOURCE_FIRST');
    await this.policy.account(userId, source.accountId);
    if (
      !this.runtime
        .liveAccountIds(source.workspaceId)
        .includes(source.accountId)
    )
      throw new ConflictException('LEAD_EXISTING_LIVE_ACCOUNT_REQUIRED');
    if (this.reconciliation)
      await this.reconciliation.setEnabled(userId, sourceId, true);
    const job = await this.prisma.$transaction(async (tx) => {
      await acquirePostgresTransactionLock(
        tx,
        `lead-history:${source.workspaceId}:${sourceId}`,
      );
      const previous = await tx.telegramLeadHistoryJob.findUnique({
        where: {
          sourceId_workspaceId: { sourceId, workspaceId: source.workspaceId },
        },
      });
      if (
        previous &&
        ['RUNNING', 'PAUSING', 'PAUSED'].includes(previous.status)
      )
        return previous;
      const now = new Date();
      const data = {
        actorUserId: userId,
        status: 'RUNNING',
        cutoffAt: new Date(now.getTime() - 90 * 86400000),
        beforeId: null,
        pages: 0,
        received: 0,
        hasGaps: false,
        lastErrorCode: null,
        leaseToken: null,
        leaseUntil: null,
        startedAt: now,
        completedAt: null,
      };
      return tx.telegramLeadHistoryJob.upsert({
        where: {
          sourceId_workspaceId: { sourceId, workspaceId: source.workspaceId },
        },
        create: { sourceId, workspaceId: source.workspaceId, ...data },
        update: data,
      });
    });
    if (job.status === 'RUNNING') {
      this.worker.wake(job.workspaceId, job.sourceId);
      await this.executor?.retrySafeFailures({
        userId,
        workspaceId: job.workspaceId,
        sourceId,
      });
      this.executor?.wake({ userId, workspaceId: job.workspaceId, sourceId });
    }
    return historyJobView(job);
  }

  async pause(userId: string, sourceId: string) {
    const source = await this.policy.source(userId, sourceId, 'manage');
    if (this.reconciliation)
      await this.reconciliation.setEnabled(userId, sourceId, false);
    await this.prisma.telegramLeadHistoryJob.updateMany({
      where: { sourceId, workspaceId: source.workspaceId, status: 'RUNNING' },
      data: { status: 'PAUSING' },
    });
    // A page already claimed may still finish. The worker transitions PAUSING to PAUSED.
    await this.prisma.telegramLeadHistoryJob.updateMany({
      where: {
        sourceId,
        workspaceId: source.workspaceId,
        status: 'PAUSING',
        leaseToken: null,
      },
      data: { status: 'PAUSED' },
    });
    return this.status(userId, sourceId);
  }

  async resume(userId: string, sourceId: string) {
    const source = await this.policy.source(userId, sourceId, 'manage');
    this.policy.assertProcessing(source, 'ingest', false);
    if (!source.accountId || !source.channelId)
      throw new ConflictException('LEAD_VALIDATE_SOURCE_FIRST');
    await this.policy.account(userId, source.accountId);
    if (
      !this.runtime
        .liveAccountIds(source.workspaceId)
        .includes(source.accountId)
    )
      throw new ConflictException('LEAD_EXISTING_LIVE_ACCOUNT_REQUIRED');
    if (this.reconciliation)
      await this.reconciliation.setEnabled(userId, sourceId, true);
    const changed = await this.prisma.telegramLeadHistoryJob.updateMany({
      where: {
        sourceId,
        workspaceId: source.workspaceId,
        status: { in: ['PAUSED', 'FAILED'] },
        leaseToken: null,
      },
      data: { actorUserId: userId, status: 'RUNNING', lastErrorCode: null },
    });
    if (changed.count) this.worker.wake(source.workspaceId, sourceId);
    const current = await this.status(userId, sourceId);
    if (changed.count || current?.status === 'COMPLETED') {
      await this.executor?.retrySafeFailures({
        userId,
        workspaceId: source.workspaceId,
        sourceId,
      });
      this.executor?.wake({
        userId,
        workspaceId: source.workspaceId,
        sourceId,
      });
    }
    return current;
  }
}
