import {
  Injectable,
  ForbiddenException,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TelegramLeadAnalysisService } from './lead-analysis.service';
import { TelegramLeadReconciliationService } from './lead-reconciliation.service';
import {
  claimLeadAnalysis,
  expireLeadAnalysisClaims,
  finishLeadAnalysisClaim,
  recoverDurableLeadClaims,
} from './lead-analysis-claim';
import { LEAD_DISCOVERY_VERSION } from './lead-analysis-version';
import { routeLeadAnalysis } from './lead-analysis-routing';
import { persistLeadPromotion } from './lead-promotion-persistence';
import { TelegramLeadPolicy } from './lead-policy.service';
import { TelegramLeadCandidateService } from './lead-candidate.service';
import { TelegramCrmRuntimeManager } from '../telegram-crm-runtime-manager.service';

const LEASE_MS = 15 * 60_000;
const BATCH_SIZE = 50;
type SourceWork = { userId: string; workspaceId: string; sourceId: string };

export function leadSourceFailureStopsDrain(code?: string) {
  return Boolean(
    code &&
    /^(?:AI_BUDGET_|AI_REQUEST_BUDGET_|AI_AUTOMATIC_DISABLED|AI_PROVIDER_(?:TRANSPORT|UNAVAILABLE|RATE_LIMITED|MODEL_UNAVAILABLE)|AI_TIMEOUT|LEAD_PROCESSING_NOT_APPROVED|LEAD_AUTOMATION_NOT_AUTHORIZED|LEAD_AUTOMATION_PAUSED|LEAD_SOURCE_CHANGED|LEAD_CLAIM_LOST|LEAD_CLAIM_INVALID|AI_WORKSPACE_MISMATCH)/.test(
      code,
    ),
  );
}

export function leadSourceFailureDisablesSource(code?: string) {
  return ![
    'LEAD_CLAIM_LOST',
    'LEAD_AUTOMATION_PAUSED',
    'AI_AUTOMATIC_DISABLED',
  ].includes(code ?? '');
}

/** In-process, bounded drain. Durable claims protect work across API instances. */
@Injectable()
export class TelegramLeadAnalysisExecutor
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(TelegramLeadAnalysisExecutor.name);
  private readonly pending = new Map<string, SourceWork>();
  private readonly running = new Set<string>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private stopped = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
    private readonly config: ConfigService,
  ) {}
  private key(work: SourceWork) {
    return `${work.workspaceId}:${work.sourceId}`;
  }
  async onApplicationBootstrap() {
    if (this.config.get<string>('INTERNAL_LEAD_DISCOVERY_ENABLED') !== 'true')
      return;
    let cursor: { sourceId: string; workspaceId: string } | undefined;
    do {
      const sources = await this.prisma.telegramLeadAutoConfig.findMany({
        where: { enabled: true },
        orderBy: [{ sourceId: 'asc' }, { workspaceId: 'asc' }],
        take: 500,
        ...(cursor
          ? { cursor: { sourceId_workspaceId: cursor }, skip: 1 }
          : {}),
        select: {
          workspaceId: true,
          sourceId: true,
          source: { select: { monitoringActorUserId: true } },
        },
      });
      for (const source of sources)
        this.wake({
          workspaceId: source.workspaceId,
          sourceId: source.sourceId,
          userId: source.source.monitoringActorUserId,
        });
      const last = sources.length === 500 ? sources.at(-1) : undefined;
      cursor = last
        ? { sourceId: last.sourceId, workspaceId: last.workspaceId }
        : undefined;
    } while (cursor && !this.stopped);
  }
  onApplicationShutdown() {
    this.stopped = true;
    this.pending.clear();
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
  wake(work: SourceWork) {
    if (
      this.stopped ||
      this.config.get<string>('INTERNAL_LEAD_DISCOVERY_ENABLED') !== 'true'
    )
      return;
    this.pending.set(this.key(work), work);
    this.drain();
  }
  /** Only explicit user actions reopen failures with no missing paid result. */
  async retrySafeFailures(work: SourceWork) {
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "TelegramLeadAnalysisQueue" q SET status='WAIT_AUTH_RECHECK', "lastErrorCode"=NULL
      FROM "TelegramLeadObservation" o, "TelegramLeadSource" s
      WHERE q."workspaceId"=${work.workspaceId} AND q."sourceId"=${work.sourceId}
        AND q."actorUserId"=${work.userId} AND q.status='FAILED'
        AND o.id=q."observationId" AND o."workspaceId"=q."workspaceId" AND o."sourceId"=q."sourceId"
        AND s.id=q."sourceId" AND s."workspaceId"=q."workspaceId"
        AND s."bindingRevision"=q."bindingRevision" AND o."contentHash"=q."contentHash"
        AND (o."classificationOperationId" IS NULL OR o.classification IS NOT NULL OR (
          o."classificationVersion"=${LEAD_DISCOVERY_VERSION} AND EXISTS (SELECT 1 FROM "AiOperation" a JOIN "AiOperationResult" r ON r."operationDbId"=a.id
            WHERE a."workspaceId"=q."workspaceId" AND a."operationId"=o."classificationOperationId" AND a."actorUserId"=q."actorUserId"
              AND a."businessObjectId"=o.id AND a.category='LEAD_AD_CLASSIFICATION' AND (a.status='SUCCEEDED' OR (a.status='RECONCILED' AND a."providerModel"=a.model)) AND a."expiresAt">clock_timestamp() AND r.version=${LEAD_DISCOVERY_VERSION})))
        AND (o."extractionOperationId" IS NULL OR o.extraction IS NOT NULL OR (
          o."extractionVersion"=${LEAD_DISCOVERY_VERSION} AND EXISTS (SELECT 1 FROM "AiOperation" a JOIN "AiOperationResult" r ON r."operationDbId"=a.id
            WHERE a."workspaceId"=q."workspaceId" AND a."operationId"=o."extractionOperationId" AND a."actorUserId"=q."actorUserId"
              AND a."businessObjectId"=o.id AND a.category='LEAD_CONTACT_EXTRACTION' AND (a.status='SUCCEEDED' OR (a.status='RECONCILED' AND a."providerModel"=a.model)) AND a."expiresAt">clock_timestamp() AND r.version=${LEAD_DISCOVERY_VERSION})))`);
  }
  private async stopSource(work: SourceWork, bindingRevision: number) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "TelegramLeadSource" WHERE id=${work.sourceId} AND "workspaceId"=${work.workspaceId} FOR UPDATE`,
      );
      await tx.telegramLeadAutoConfig.updateMany({
        where: {
          sourceId: work.sourceId,
          workspaceId: work.workspaceId,
          enabled: true,
          source: { bindingRevision, monitoringActorUserId: work.userId },
        },
        data: { enabled: false },
      });
    });
  }
  private defer(work: SourceWork, due: Date) {
    const key = this.key(work);
    if (this.timers.has(key) || this.stopped) return;
    const timer = setTimeout(
      () => {
        this.timers.delete(key);
        this.wake(work);
      },
      Math.max(1, due.getTime() - Date.now() + 1),
    );
    timer.unref?.();
    this.timers.set(key, timer);
  }
  private drain() {
    for (const [key, work] of this.pending) {
      if (this.running.size >= 2) return;
      if (this.running.has(key)) continue;
      this.pending.delete(key);
      this.running.add(key);
      void this.runSource(work)
        .then((more) => {
          if (more && !this.stopped) this.pending.set(key, work);
        })
        .catch(() => this.logger.warn('LEAD_ANALYSIS_EXECUTOR_FAILED'))
        .finally(() => {
          this.running.delete(key);
          if (!this.stopped) this.drain();
        });
    }
  }
  private async services(work: SourceWork) {
    const context = ContextIdFactory.create();
    this.moduleRef.registerRequestByContextId(
      {
        headers: { 'x-workspace-id': work.workspaceId },
        user: { sub: work.userId },
      },
      context,
    );
    const analysis = await this.moduleRef.resolve(
      TelegramLeadAnalysisService,
      context,
      { strict: false },
    );
    const reconciliation = await this.moduleRef.resolve(
      TelegramLeadReconciliationService,
      context,
      { strict: false },
    );
    const policy = await this.moduleRef.resolve(TelegramLeadPolicy, context, {
      strict: false,
    });
    const candidates = await this.moduleRef.resolve(
      TelegramLeadCandidateService,
      context,
      { strict: false },
    );
    const runtime = await this.moduleRef.resolve(
      TelegramCrmRuntimeManager,
      context,
      { strict: false },
    );
    return { analysis, reconciliation, policy, candidates, runtime };
  }
  /** Performs at most one reconciliation page and 50 queued observations. */
  async runSource(work: SourceWork) {
    const { analysis, reconciliation, policy, candidates, runtime } =
      await this.services(work);
    await expireLeadAnalysisClaims(
      this.prisma,
      work.workspaceId,
      work.sourceId,
    );
    await recoverDurableLeadClaims(
      this.prisma,
      work.workspaceId,
      work.sourceId,
      LEAD_DISCOVERY_VERSION,
    );
    const page = await reconciliation.reconcilePage(work.userId, work.sourceId);
    if (page.blocked) return false;
    for (let i = 0; i < BATCH_SIZE && !this.stopped; i++) {
      const claim = await claimLeadAnalysis(
        this.prisma,
        work.workspaceId,
        work.sourceId,
        LEASE_MS,
      );
      if (!claim) {
        const active = await this.prisma.telegramLeadAnalysisQueue.findFirst({
          where: {
            workspaceId: work.workspaceId,
            sourceId: work.sourceId,
            status: 'RUNNING',
            claimUntil: { not: null },
          },
          orderBy: { claimUntil: 'asc' },
          select: { claimUntil: true },
        });
        if (active?.claimUntil) this.defer(work, active.claimUntil);
        return !page.complete && !active;
      }
      let aiAttempted = false;
      try {
        if (claim.actorUserId !== work.userId)
          throw new Error('LEAD_CLAIM_INVALID');
        const route = await routeLeadAnalysis(this.prisma, policy, claim);
        if (
          route.decision === 'NEEDS_METADATA' ||
          route.decision === 'NEEDS_MEDIA_ANALYSIS' ||
          route.decision === 'SAFE_SKIP'
        ) {
          const updated = await finishLeadAnalysisClaim(
            this.prisma,
            claim,
            route.decision === 'SAFE_SKIP' ? 'COMPLETED' : route.decision,
          );
          if (!updated) return false;
          continue;
        }
        if (route.deterministicTitle) {
          await policy.recheckAi(work.userId, work.sourceId);
          await candidates.materialCandidate(
            work.workspaceId,
            work.userId,
            claim.observationId,
            { title: route.deterministicTitle, contacts: [] },
            claim.contentHash,
            'ai',
            true,
            route.sourceSnapshot,
            claim,
          );
          await persistLeadPromotion(this.prisma, policy, claim);
          const updated = await finishLeadAnalysisClaim(
            this.prisma,
            claim,
            'COMPLETED',
          );
          if (!updated) return false;
          continue;
        }
        if (route.decision === 'LIKELY_AD' && route.textCandidate) {
          const source = await policy.recheckAi(work.userId, work.sourceId);
          policy.assertProcessing(source, 'ingest', true);
          let profile:
            | { channelId: string; username: string; about: string }
            | undefined;
          if (
            route.textCandidate.telegramUsername &&
            !/_bot$/i.test(route.textCandidate.telegramUsername) &&
            source.accountId &&
            runtime
          ) {
            try {
              profile = await runtime.withLiveAccountHandle(
                work.workspaceId,
                source.accountId,
                async (handle) =>
                  handle.leadDiscovery?.publicProfile?.(
                    route.textCandidate!.telegramUsername!,
                  ),
              );
            } catch {
              /* Unavailable or protected targets remain unverified. */
            }
          }
          await policy.recheckAi(work.userId, work.sourceId);
          await candidates.materialCandidate(
            work.workspaceId,
            work.userId,
            claim.observationId,
            route.textCandidate,
            claim.contentHash,
            'ai',
            true,
            route.sourceSnapshot,
            claim,
            route.textCandidate.title,
            profile,
          );
        }
        if (route.decision === 'LIKELY_AD' && !route.textCandidate) {
          await policy.recheckAi(work.userId, work.sourceId);
          await candidates.materialCandidate(
            work.workspaceId,
            work.userId,
            claim.observationId,
            { title: 'Неустановленный проект', contacts: route.directContacts },
            claim.contentHash,
            'ai',
            true,
            route.sourceSnapshot,
            claim,
            undefined,
            undefined,
            true,
          );
        }
        if (['LIKELY_AD', 'LIKELY_VP'].includes(route.decision)) {
          const updated = await finishLeadAnalysisClaim(
            this.prisma,
            claim,
            'NEEDS_REVIEW',
          );
          if (!updated) return false;
          continue;
        }
        // An AI verdict based only on text cannot rule out an advertisement
        // contained in unexamined media, even when text signals are positive.
        if (route.mediaUnanalyzed) {
          const updated = await finishLeadAnalysisClaim(
            this.prisma,
            claim,
            'NEEDS_MEDIA_ANALYSIS',
          );
          if (!updated) return false;
          continue;
        }
        aiAttempted = true;
        const result = await analysis.analyzeAutomatically(
          work.userId,
          [claim.observationId],
          claim,
        );
        const status = result.unknown
          ? 'UNKNOWN'
          : result.failed
            ? 'FAILED'
            : 'COMPLETED';
        if (
          status === 'COMPLETED' &&
          ['LIKELY_AD', 'LIKELY_VP'].includes(route.decision)
        )
          await persistLeadPromotion(this.prisma, policy, claim);
        const updated = await finishLeadAnalysisClaim(
          this.prisma,
          claim,
          status,
          result.failures?.[0]?.code ?? null,
        );
        if (!updated) return false;
        if (leadSourceFailureStopsDrain(result.failures?.[0]?.code)) {
          if (leadSourceFailureDisablesSource(result.failures?.[0]?.code))
            await this.stopSource(work, claim.bindingRevision);
          return false;
        }
      } catch (error) {
        // Preserve uncertainty after a possible dispatch; pre-dispatch failures are safe to retry explicitly.
        const code =
          error instanceof Error ? error.message : 'LEAD_EXECUTION_UNCERTAIN';
        const updated = await finishLeadAnalysisClaim(
          this.prisma,
          claim,
          aiAttempted ? 'UNKNOWN' : 'FAILED',
          /^[A-Z_]{1,100}$/.test(code) ? code : 'LEAD_EXECUTION_UNCERTAIN',
        );
        if (!updated) {
          this.wake(work);
          return false;
        }
        if (
          error instanceof ForbiddenException ||
          leadSourceFailureStopsDrain(code)
        ) {
          if (leadSourceFailureDisablesSource(code))
            await this.stopSource(work, claim.bindingRevision);
          return false;
        }
      }
    }
    return true;
  }
}
