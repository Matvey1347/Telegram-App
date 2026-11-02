import { isLeadManualRecovery } from './lead-recovery-mode';
import {
  Injectable,
  Logger,
  Optional,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import type { Subscription } from 'rxjs';
import { PrismaService } from '../../../../prisma/prisma.service';
import { acquirePostgresTransactionLock } from '../../../../prisma/postgres-advisory-lock';
import { TelegramLeadTransportEvents } from '../../../../telegram/shared/mtproto/telegram-lead-transport-events';
import { TelegramLeadTransportService } from './lead-transport.service';
import { TelegramLeadAnalysisExecutor } from './lead-analysis-executor.service';
import { TelegramLeadPolicy } from './lead-policy.service';
import { loadLeadIngestSources } from './lead-ingest-sources';

const LEASE_MS = 120_000;
const MAX_PAGES = 1000;
type Identity = { workspaceId: string; sourceId: string };

/** One in-process bounded queue, activated only by explicit work and startup recovery. */
@Injectable()
export class TelegramLeadHistoryWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(TelegramLeadHistoryWorker.name);
  private readonly queue = new Map<string, Identity>();
  private readonly deferred = new Map<string, Identity & { due: number }>();
  private readonly running = new Set<string>();
  private readonly rerun = new Set<string>();
  private timer?: NodeJS.Timeout;
  private subscription?: Subscription;
  private stopped = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
    private readonly events: TelegramLeadTransportEvents,
    private readonly config: ConfigService,
    @Optional() private readonly executor?: TelegramLeadAnalysisExecutor,
  ) {}
  async onApplicationBootstrap() {
    if (
      this.config.get<string>('INTERNAL_LEAD_DISCOVERY_ENABLED') !== 'true' ||
      isLeadManualRecovery(this.config)
    )
      return;
    this.subscription = this.events.stream.subscribe((event) => {
      if (event.type === 'connected')
        void this.wakeAccount(event.workspaceId, event.accountId).catch(() =>
          this.logger.warn('LEAD_HISTORY_RECONNECT_UNAVAILABLE'),
        );
    });
    const jobs = await this.prisma.telegramLeadHistoryJob.findMany({
      where: { status: { in: ['RUNNING', 'PAUSING'] } },
      select: { workspaceId: true, sourceId: true },
      orderBy: { id: 'asc' },
      take: 10001,
    });
    if (jobs.length > 10000) {
      this.logger.warn('LEAD_HISTORY_RECOVERY_LIMIT');
    }
    for (const job of jobs.slice(0, 10000))
      this.wake(job.workspaceId, job.sourceId);
  }
  onApplicationShutdown() {
    this.stopped = true;
    this.subscription?.unsubscribe();
    if (this.timer) clearTimeout(this.timer);
    this.queue.clear();
    this.deferred.clear();
    this.rerun.clear();
  }
  private key(id: Identity) {
    return `${id.workspaceId}:${id.sourceId}`;
  }
  wake(workspaceId: string, sourceId: string) {
    if (
      this.stopped ||
      this.config.get<string>('INTERNAL_LEAD_DISCOVERY_ENABLED') !== 'true' ||
      isLeadManualRecovery(this.config)
    )
      return;
    const id = { workspaceId, sourceId },
      key = this.key(id);
    if (this.running.has(key)) {
      this.rerun.add(key);
      return;
    }
    this.queue.set(key, id);
    this.drain();
  }
  private drain() {
    while (!this.stopped && this.running.size < 2 && this.queue.size) {
      const entry = this.queue.entries().next();
      if (entry.done) return;
      const [key, id] = entry.value;
      this.queue.delete(key);
      this.running.add(key);
      void this.run(id)
        .catch(() => this.logger.warn('LEAD_HISTORY_WORKER_UNAVAILABLE'))
        .finally(() => {
          this.running.delete(key);
          if (this.rerun.delete(key)) this.wake(id.workspaceId, id.sourceId);
          this.drain();
        });
    }
  }
  private defer(id: Identity, due: number) {
    this.deferred.set(this.key(id), { ...id, due });
    if (this.timer) clearTimeout(this.timer);
    const earliest = Math.min(...[...this.deferred.values()].map((v) => v.due));
    this.timer = setTimeout(
      () => {
        this.timer = undefined;
        const now = Date.now();
        for (const [key, value] of this.deferred)
          if (value.due <= now) {
            this.deferred.delete(key);
            this.wake(value.workspaceId, value.sourceId);
          }
        if (this.deferred.size) this.deferTimer();
      },
      Math.max(1, earliest - Date.now()),
    );
    this.timer.unref?.();
  }
  private deferTimer() {
    const first = [...this.deferred.values()].sort((a, b) => a.due - b.due)[0];
    if (first) this.defer(first, first.due);
  }
  private async wakeAccount(workspaceId: string, accountId: string) {
    if (this.stopped) return;
    const jobs = await this.prisma.telegramLeadHistoryJob.findMany({
      where: { workspaceId, status: 'RUNNING', source: { accountId } },
      select: { workspaceId: true, sourceId: true },
      take: 1000,
    });
    for (const job of jobs) this.wake(job.workspaceId, job.sourceId);
  }
  private async transport(userId: string, workspaceId: string) {
    const contextId = ContextIdFactory.create();
    this.moduleRef.registerRequestByContextId(
      { headers: { 'x-workspace-id': workspaceId }, user: { sub: userId } },
      contextId,
    );
    return this.moduleRef.resolve(TelegramLeadTransportService, contextId, {
      strict: false,
    });
  }
  private async policy(userId: string, workspaceId: string) {
    const contextId = ContextIdFactory.create();
    this.moduleRef.registerRequestByContextId(
      { headers: { 'x-workspace-id': workspaceId }, user: { sub: userId } },
      contextId,
    );
    return this.moduleRef.resolve(TelegramLeadPolicy, contextId, {
      strict: false,
    });
  }
  private async run(id: Identity) {
    const key = {
      sourceId_workspaceId: {
        sourceId: id.sourceId,
        workspaceId: id.workspaceId,
      },
    };
    let job = await this.prisma.telegramLeadHistoryJob.findUnique({
      where: key,
    });
    if (!job || !['RUNNING', 'PAUSING'].includes(job.status)) return;
    if (job.leaseUntil && job.leaseUntil.getTime() > Date.now()) {
      this.defer(id, job.leaseUntil.getTime() + 1);
      return;
    }
    if (job.status === 'PAUSING') {
      await this.prisma.telegramLeadHistoryJob.updateMany({
        where: {
          ...id,
          status: 'PAUSING',
          OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }],
        },
        data: { status: 'PAUSED', leaseToken: null, leaseUntil: null },
      });
      return;
    }
    const token = randomUUID();
    const claimed = await this.prisma.telegramLeadHistoryJob.updateMany({
      where: {
        ...id,
        status: 'RUNNING',
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }],
      },
      data: { leaseToken: token, leaseUntil: new Date(Date.now() + LEASE_MS) },
    });
    if (!claimed.count) return;
    try {
      while (!this.stopped) {
        job = await this.prisma.telegramLeadHistoryJob.findUnique({
          where: key,
        });
        if (!job || job.leaseToken !== token || job.status !== 'RUNNING') break;
        const admitted = await this.prisma.telegramLeadHistoryJob.updateMany({
          where: {
            ...id,
            status: 'RUNNING',
            leaseToken: token,
            leaseUntil: { gt: new Date() },
          },
          data: { leaseUntil: new Date(Date.now() + LEASE_MS) },
        });
        if (!admitted.count) break;
        const transport = await this.transport(job.actorUserId, id.workspaceId);
        const page = await transport.scan(job.actorUserId, id.sourceId, {
          limit: 50,
          beforeId: job.beforeId ?? undefined,
          cutoffAt: job.cutoffAt,
          historyLeaseToken: token,
        });
        const now = new Date();
        if (page.blockedSourceIds?.includes(id.sourceId)) {
          await this.prisma.telegramLeadHistoryJob.updateMany({
            where: {
              ...id,
              status: 'RUNNING',
              leaseToken: token,
              leaseUntil: { gt: now },
            },
            data: {
              status: 'FAILED',
              lastErrorCode: 'LEAD_HISTORY_ACCESS_REVOKED',
              hasGaps: true,
              leaseToken: null,
              leaseUntil: null,
            },
          });
          await this.prisma.telegramLeadHistoryJob.updateMany({
            where: {
              ...id,
              status: 'PAUSING',
              leaseToken: token,
              leaseUntil: { gt: now },
            },
            data: {
              status: 'PAUSED',
              lastErrorCode: 'LEAD_HISTORY_ACCESS_REVOKED',
              hasGaps: true,
              leaseToken: null,
              leaseUntil: null,
            },
          });
          break;
        }
        if (page.historyFenceLost) {
          await this.prisma.telegramLeadHistoryJob.updateMany({
            where: {
              ...id,
              status: { in: ['RUNNING', 'PAUSING'] },
              leaseToken: token,
              leaseUntil: { gt: now },
            },
            data: {
              status: 'PAUSED',
              lastErrorCode: 'LEAD_HISTORY_SOURCE_CHANGED',
              hasGaps: true,
              leaseToken: null,
              leaseUntil: null,
            },
          });
          break;
        }
        const hasValidCursor =
          page.nextBeforeId !== null &&
          Number.isSafeInteger(page.nextBeforeId) &&
          (job.beforeId === null || page.nextBeforeId < job.beforeId);
        const complete = page.reachedCutoff || !page.hasMore;
        const error =
          !complete && !hasValidCursor
            ? 'LEAD_HISTORY_CURSOR_INVALID'
            : !complete && job.pages + 1 >= MAX_PAGES
              ? 'LEAD_HISTORY_PAGE_LIMIT'
              : null;
        const data = {
          pages: { increment: 1 },
          received: { increment: page.received },
          beforeId: page.nextBeforeId,
          lastErrorCode: error,
          ...(page.gap || page.filtered ? { hasGaps: true } : {}),
          ...(complete || error
            ? {
                status: complete ? 'COMPLETED' : 'PAUSED',
                completedAt: complete ? now : null,
                leaseToken: null,
                leaseUntil: null,
              }
            : {}),
        };
        const snapshot = page.historySourceSnapshot;
        if (!snapshot) throw new Error('LEAD_HISTORY_SOURCE_SNAPSHOT_MISSING');
        const policy = await this.policy(job.actorUserId, id.workspaceId);
        const applied = await this.prisma.$transaction(async (tx) => {
          await acquirePostgresTransactionLock(
            tx,
            `lead-discovery:${id.workspaceId}`,
          );
          const event = {
            sourceId: id.sourceId,
            material: {
              externalMessageId: '0',
              text: '',
              publishedAt: new Date().toISOString(),
            },
            expectedTransport: snapshot,
          };
          const eligibility = await loadLeadIngestSources(
            tx,
            policy,
            id.workspaceId,
            [event],
            true,
          );
          const eligible =
            eligibility.eligible.has(id.sourceId) && eligibility.matches(event);
          const checkAt = new Date();
          if (!eligible) {
            await tx.telegramLeadHistoryJob.updateMany({
              where: {
                ...id,
                status: { in: ['RUNNING', 'PAUSING'] },
                leaseToken: token,
                leaseUntil: { gt: checkAt },
              },
              data: {
                status: 'PAUSED',
                lastErrorCode: 'LEAD_HISTORY_SOURCE_CHANGED',
                hasGaps: true,
                leaseToken: null,
                leaseUntil: null,
              },
            });
            return false;
          }
          const result = await tx.telegramLeadHistoryJob.updateMany({
            where: {
              ...id,
              status: 'RUNNING',
              leaseToken: token,
              leaseUntil: { gt: checkAt },
            },
            data,
          });
          if (result.count) return true;
          await tx.telegramLeadHistoryJob.updateMany({
            where: {
              ...id,
              status: 'PAUSING',
              leaseToken: token,
              leaseUntil: { gt: checkAt },
            },
            data: {
              ...data,
              status: 'PAUSED',
              completedAt: null,
              leaseToken: null,
              leaseUntil: null,
            },
          });
          return false;
        });
        if (!applied) break;
        this.executor?.wake({
          userId: job.actorUserId,
          workspaceId: id.workspaceId,
          sourceId: id.sourceId,
        });
        if (complete || error) break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const code = /LEAD_EXISTING_LIVE_ACCOUNT_REQUIRED/.test(message)
        ? 'ACCOUNT_NOT_CONNECTED'
        : /LEAD_DAILY_POST_QUOTA/.test(message)
          ? 'LEAD_DAILY_POST_QUOTA'
          : 'LEAD_HISTORY_FAILED';
      await this.prisma.telegramLeadHistoryJob.updateMany({
        where: {
          ...id,
          status: 'RUNNING',
          leaseToken: token,
          leaseUntil: { gt: new Date() },
        },
        data: {
          status:
            code === 'ACCOUNT_NOT_CONNECTED'
              ? 'RUNNING'
              : code === 'LEAD_DAILY_POST_QUOTA'
                ? 'PAUSED'
                : 'FAILED',
          lastErrorCode: code,
          leaseToken: null,
          leaseUntil: null,
        },
      });
    } finally {
      if (!this.stopped) {
        await this.prisma.telegramLeadHistoryJob.updateMany({
          where: {
            ...id,
            status: 'RUNNING',
            leaseToken: token,
            leaseUntil: { lte: new Date() },
          },
          data: {
            status: 'PAUSED',
            lastErrorCode: 'LEAD_HISTORY_LEASE_EXPIRED',
            leaseToken: null,
            leaseUntil: null,
          },
        });
      }
      await this.prisma.telegramLeadHistoryJob.updateMany({
        where: { ...id, status: 'PAUSING', leaseToken: token },
        data: { status: 'PAUSED', leaseToken: null, leaseUntil: null },
      });
    }
  }
}
