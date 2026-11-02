import { isLeadManualRecovery } from './lead-recovery-mode';
import { extractLeadTargetEvidence } from './lead-advertised-targets';
import {
  LeadMonitorProof,
  persistLeadGaps,
  pauseIneligibleLeadSources,
  type WatchedLeadSource as WatchedSource,
} from './lead-monitor-proof';
import {
  Injectable,
  HttpException,
  Logger,
  Optional,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import type { Subscription } from 'rxjs';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  TelegramLeadTransportEvents,
  type TelegramLeadTransportEvent,
} from '../../../../telegram/shared/mtproto/telegram-lead-transport-events';
import {
  TelegramLeadIngestService,
  type LeadIngestEvent,
} from './lead-ingest.service';
import { TelegramLeadAnalysisExecutor } from './lead-analysis-executor.service';
import { TelegramLeadTransportService } from './lead-transport.service';
import { TelegramCrmRuntimeManager } from '../telegram-crm-runtime-manager.service';

type Pending = { source: WatchedSource; event: LeadIngestEvent };
/** Event-triggered bounded capture only; no AI, polling or new Telegram handle. */
@Injectable()
export class TelegramLeadMonitorService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(TelegramLeadMonitorService.name);
  private subscription?: Subscription;
  private sources: WatchedSource[] = [];
  private readonly queue = new Map<string, Pending>();
  private readonly proof = new LeadMonitorProof();
  private get gaps() {
    return this.proof.gaps;
  }
  private get gapVersions() {
    return this.proof.versions;
  }
  private get uncertain() {
    return this.proof.uncertain;
  }
  private readonly quotaMutedUntil = new Map<string, number>();
  private readonly recovering = new Set<string>();
  private timer?: NodeJS.Timeout;
  private flushing = false;
  private stopped = false;
  private reload?: Promise<void>;
  private reloadAgain = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly events: TelegramLeadTransportEvents,
    private readonly moduleRef: ModuleRef,
    private readonly runtime: TelegramCrmRuntimeManager,
    @Optional() private readonly executor?: TelegramLeadAnalysisExecutor,
  ) {}

  async onApplicationBootstrap() {
    if (
      this.config.get<string>('INTERNAL_LEAD_DISCOVERY_ENABLED') !== 'true' ||
      isLeadManualRecovery(this.config)
    )
      return;
    this.subscription = this.events.stream.subscribe((event) =>
      this.receive(event),
    );
    await this.reloadSources().catch(() =>
      this.logger.warn('LEAD_MONITOR_REGISTRY_UNAVAILABLE'),
    );
  }
  onApplicationShutdown() {
    this.stopped = true;
    this.subscription?.unsubscribe();
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.queue.clear();
    this.quotaMutedUntil.clear();
    this.gaps.clear();
    this.proof.clear();
    this.sources = [];
  }
  private reloadSources() {
    if (this.reload) {
      this.reloadAgain = true;
      return this.reload;
    }
    return (this.reload = this.loadSources().finally(() => {
      this.reload = undefined;
      if (this.reloadAgain && !this.stopped) {
        this.reloadAgain = false;
        void this.reloadSources().catch(() =>
          this.logger.warn('LEAD_MONITOR_REGISTRY_UNAVAILABLE'),
        );
      }
    }));
  }
  private async loadSources() {
    const rows = await this.prisma.telegramLeadSource.findMany({
      where: {
        monitoringState: 'ACTIVE',
        type: 'TELEGRAM_CHANNEL',
        accountId: { not: null },
        channelId: { not: null },
      },
      select: {
        id: true,
        workspaceId: true,
        accountId: true,
        channelId: true,
        monitoringActorUserId: true,
        processingReference: true,
        bindingRevision: true,
      },
      orderBy: { id: 'asc' },
      take: 10_001,
    });
    if (this.stopped) return;
    if (rows.length > 10_000) {
      this.sources = [];
      this.proof.clear();
      this.logger.warn('LEAD_MONITOR_GLOBAL_SOURCE_LIMIT');
      return;
    }
    const previous = new Set(
      this.sources.map((source) => `${source.id}:${source.bindingRevision}`),
    );
    this.sources = rows;
    this.proof.retain(new Set(rows.map((source) => source.id)));
    const unverified = rows.filter(
      (source) => !previous.has(`${source.id}:${source.bindingRevision}`),
    );
    for (const source of unverified) this.markGap(source);
    if (unverified.length) await persistLeadGaps(this.prisma, unverified);
    const accounts = new Map(
      rows
        .filter(
          (source) => !previous.has(`${source.id}:${source.bindingRevision}`),
        )
        .map((source) => [`${source.workspaceId}:${source.accountId}`, source]),
    );
    for (const source of accounts.values())
      if (
        source.accountId &&
        this.runtime
          .liveAccountIds(source.workspaceId)
          .includes(source.accountId)
      )
        void this.recoverAccount(source.workspaceId, source.accountId);
  }
  private receive(event: TelegramLeadTransportEvent) {
    if (this.stopped) return;
    if (this.proof.receive(event)) {
      this.arm();
      return;
    }
    if (event.type === 'registry.changed') {
      void this.reloadSources().catch(() =>
        this.logger.warn('LEAD_MONITOR_REGISTRY_UNAVAILABLE'),
      );
      return;
    }
    if (this.quotaMuted(event.workspaceId)) return;
    const sources = this.sources.filter(
      (source) =>
        source.workspaceId === event.workspaceId &&
        source.accountId === event.accountId,
    );
    if (!sources.length) return;
    if (event.type === 'connected') {
      void this.recoverAccount(event.workspaceId, event.accountId);
      return;
    }
    if (event.type === 'disconnected') {
      for (const source of sources) this.markGap(source);
      this.arm();
      return;
    }
    if (event.type !== 'channel') return;
    const update = event.event;
    if (update.type === 'channel.gap') {
      for (const source of sources.filter(
        (source) => !update.channelId || source.channelId === update.channelId,
      ))
        this.markGap(source);
      this.arm();
      void this.recoverAccount(event.workspaceId, event.accountId);
      return;
    }
    const channelId =
      update.type === 'post.deleted' ? update.channelId : update.post.channelId;
    for (const source of sources.filter(
      (source) => source.channelId === channelId,
    )) {
      if (update.type === 'post.deleted') {
        for (const id of update.messageIds)
          this.enqueue(source, {
            sourceId: source.id,
            material: {
              externalMessageId: String(id),
              text: '',
              publishedAt: new Date().toISOString(),
              deleted: true,
            },
            pts: update.pts,
            ptsCount: update.ptsCount,
            gap: true,
          });
      } else
        this.enqueue(source, {
          sourceId: source.id,
          material: {
            externalMessageId: String(update.post.messageId),
            text: update.post.text,
            publishedAt: update.post.publishedAt.toISOString(),
          },
          pts: update.pts,
          ptsCount: update.ptsCount,
          textMetadataComplete:
            update.post.metadata?.textComplete === undefined
              ? undefined
              : update.post.metadata.textComplete &&
                update.post.text.normalize('NFC').length <= 4096 &&
                extractLeadTargetEvidence(
                  update.post.text,
                  update.post.metadata,
                ).length < 60,
          mediaPresent: update.post.metadata?.hasMedia,
          metadataComplete: Boolean(
            update.post.metadata?.complete &&
            extractLeadTargetEvidence(update.post.text, update.post.metadata)
              .length < 60,
          ),
          metadataTextOnly: Boolean(
            update.post.metadata?.complete &&
            !update.post.metadata.entityUrls.length &&
            !update.post.metadata.inlineButtonUrls.length &&
            !update.post.metadata.hasForwardMetadata &&
            !update.post.metadata.hasMedia,
          ),
          targetEvidence: update.post.metadata
            ? extractLeadTargetEvidence(update.post.text, update.post.metadata)
            : undefined,
          editedAt: update.post.editedAt ?? undefined,
        });
    }
  }
  private enqueue(source: WatchedSource, event: LeadIngestEvent) {
    event.capturedAt = new Date();
    event.expectedTransport = {
      accountId: source.accountId,
      channelId: source.channelId,
      processingReference: source.processingReference,
      monitoringActorUserId: source.monitoringActorUserId,
      bindingRevision: source.bindingRevision,
    };
    if (this.uncertain.has(source.id)) event.gap = true;
    const key = `${source.id}:${event.material.externalMessageId}`;
    const previous = this.queue.get(key);
    if (previous?.event.pts && event.pts && event.pts <= previous.event.pts)
      return;
    if (!previous && this.queue.size >= 1_000) {
      this.markGap(source);
      this.arm();
      return;
    }
    // Coalesced intermediate edits/deletes cannot independently prove a pts chain.
    if (previous && previous.event.pts !== event.pts) {
      event.gap = true;
      this.markGap(source);
    }
    this.queue.set(key, { source, event });
    if (event.gap || !/[\p{L}\p{N}]/u.test(event.material.text))
      this.markGap(source);
    this.arm();
  }
  private markGap(source: WatchedSource) {
    this.proof.mark(source);
  }
  private arm() {
    if (
      this.timer ||
      this.flushing ||
      this.stopped ||
      (!this.queue.size && !this.gaps.size)
    )
      return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, 50);
    this.timer.unref?.();
  }
  private async scoped<T>(
    userId: string,
    workspaceId: string,
    service: new (...args: never[]) => T,
  ): Promise<T> {
    const contextId = ContextIdFactory.create();
    this.moduleRef.registerRequestByContextId(
      { headers: { 'x-workspace-id': workspaceId }, user: { sub: userId } },
      contextId,
    );
    return this.moduleRef.resolve(service, contextId, { strict: false });
  }
  private async flush() {
    if (this.flushing || this.stopped) return;
    this.flushing = true;
    const items = [...this.queue.entries()].slice(0, 100);
    for (const [key] of items) this.queue.delete(key);
    const groups = new Map<string, Pending[]>();
    for (const [, item] of items) {
      const key = `${item.source.workspaceId}:${item.source.monitoringActorUserId}`;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    try {
      for (const group of groups.values()) {
        const source = group[0].source;
        if (this.quotaMuted(source.workspaceId)) continue;
        try {
          const ingest = await this.scoped(
            source.monitoringActorUserId,
            source.workspaceId,
            TelegramLeadIngestService,
          );
          const result = await ingest.ingestBatch(
            source.monitoringActorUserId,
            source.workspaceId,
            group.map((item) => item.event),
          );
          if (this.executor) {
            const enabled = await this.prisma.telegramLeadAutoConfig.findMany({
              where: {
                workspaceId: source.workspaceId,
                enabled: true,
                sourceId: {
                  in: [...new Set(group.map((item) => item.source.id))],
                },
              },
              select: { sourceId: true },
            });
            for (const item of enabled)
              this.executor.wake({
                userId: source.monitoringActorUserId,
                workspaceId: source.workspaceId,
                sourceId: item.sourceId,
              });
          }
          if (result.gap || result.filtered)
            for (const item of group) this.markGap(item.source);
          if (result.blockedSourceIds?.length)
            await this.pause(
              group
                .map((item) => item.source)
                .filter((source) =>
                  result.blockedSourceIds!.includes(source.id),
                ),
            );
        } catch (error) {
          for (const item of group) this.markGap(item.source);
          if (
            error instanceof HttpException &&
            error.message === 'LEAD_DAILY_POST_QUOTA'
          )
            this.muteQuota(source.workspaceId);
          if (error instanceof HttpException && error.getStatus() === 403)
            await this.pause(group.map((item) => item.source));
          this.logger.warn('LEAD_MONITOR_BATCH_UNAVAILABLE');
        }
      }
      const gaps = [...this.gaps.values()].slice(0, 1_000);
      if (gaps.length) {
        const versions = new Map(
          gaps.map((source) => [source.id, this.gapVersions.get(source.id)]),
        );
        await persistLeadGaps(
          this.prisma,
          gaps,
          (id) =>
            versions.get(id) === this.gapVersions.get(id) && this.gaps.has(id),
        );
        for (const source of gaps)
          if (versions.get(source.id) === this.gapVersions.get(source.id)) {
            this.gaps.delete(source.id);
          }
      }
    } catch {
      // Do not retry a failed DB batch indefinitely; pts recovery remains explicit.
      this.gaps.clear();
      this.logger.warn('LEAD_MONITOR_GAP_WRITE_UNAVAILABLE');
    } finally {
      this.flushing = false;
      this.arm();
    }
  }
  private quotaMuted(workspaceId: string) {
    const until = this.quotaMutedUntil.get(workspaceId);
    if (until && until > Date.now()) return true;
    this.quotaMutedUntil.delete(workspaceId);
    return false;
  }
  private muteQuota(workspaceId: string) {
    const tomorrow = new Date();
    tomorrow.setUTCHours(24, 0, 0, 0);
    this.quotaMutedUntil.set(workspaceId, tomorrow.getTime());
    for (const source of this.sources)
      if (source.workspaceId === workspaceId) this.markGap(source);
    for (const [key, item] of this.queue)
      if (item.source.workspaceId === workspaceId) this.queue.delete(key);
  }
  private async pause(sources: WatchedSource[]) {
    const unique = [
      ...new Map(sources.map((source) => [source.id, source])).values(),
    ];
    if (!unique.length) return;
    const ids = new Set(await pauseIneligibleLeadSources(this.prisma, unique));
    if (!ids.size) {
      void this.reloadSources();
      return;
    }
    this.sources = this.sources.filter((source) => !ids.has(source.id));
    this.proof.retain(new Set(this.sources.map((source) => source.id)));
    for (const [key, value] of this.queue)
      if (ids.has(value.source.id)) this.queue.delete(key);
  }
  private async recoverAccount(workspaceId: string, accountId: string) {
    const key = `${workspaceId}:${accountId}`;
    if (
      this.recovering.has(key) ||
      this.stopped ||
      this.quotaMuted(workspaceId)
    )
      return;
    if (this.recovering.size >= 2) {
      for (const source of this.sources.filter(
        (source) =>
          source.workspaceId === workspaceId && source.accountId === accountId,
      ))
        this.markGap(source);
      this.arm();
      return;
    }
    this.recovering.add(key);
    try {
      const sources = this.sources
        .filter(
          (source) =>
            source.workspaceId === workspaceId &&
            source.accountId === accountId,
        )
        .slice(0, 20);
      for (const source of this.sources
        .filter(
          (source) =>
            source.workspaceId === workspaceId &&
            source.accountId === accountId,
        )
        .slice(20))
        this.markGap(source);
      // One pass, one existing handle/account. Excess sources need explicit recovery.
      for (const source of sources) {
        try {
          const transport = await this.scoped(
            source.monitoringActorUserId,
            workspaceId,
            TelegramLeadTransportService,
          );
          const version = this.gapVersions.get(source.id);
          const result = await transport.recover(
            source.monitoringActorUserId,
            source.id,
          );
          if (
            !result.gap &&
            !result.filtered &&
            version === this.gapVersions.get(source.id)
          ) {
            this.gaps.delete(source.id);
            this.gapVersions.delete(source.id);
            this.uncertain.delete(source.id);
          }
        } catch {
          this.markGap(source);
        }
      }
    } finally {
      this.recovering.delete(key);
      this.arm();
    }
  }
}
