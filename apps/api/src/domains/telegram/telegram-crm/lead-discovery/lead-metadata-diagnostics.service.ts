import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { TelegramCrmRuntimeManager } from '../telegram-crm-runtime-manager.service';
import { TelegramLeadPolicy } from './lead-policy.service';
import { TelegramLeadTransportService } from './lead-transport.service';
import { isDeepStrictEqual } from 'node:util';
import { extractLeadTargetEvidence } from './lead-advertised-targets';
import {
  leadTransportMatches,
  leadTransportSnapshot,
} from './lead-transport-snapshot';

/** Bounded, on-demand aggregate; no post contents or Telegram credentials leave the runtime. */
@Injectable()
export class TelegramLeadMetadataDiagnostics {
  constructor(
    private readonly policy: TelegramLeadPolicy,
    private readonly runtime: TelegramCrmRuntimeManager,
    private readonly transport: TelegramLeadTransportService,
  ) {}

  /** Read one photo from the owned session, never invoke AI or persist its bytes. */
  async checkPhoto(userId: string, sourceId: string, observationId: string) {
    const source = await this.policy.source(userId, sourceId, 'analyze');
    this.policy.assertProcessing(source, 'ingest', true);
    this.policy.assertProcessing(source, 'ai', true);
    if (!source.accountId || !source.channelId)
      throw new BadRequestException('LEAD_VALIDATE_SOURCE_FIRST');
    const row = await this.policy.prisma.telegramLeadObservation.findFirst({
      where: {
        id: observationId,
        workspaceId: source.workspaceId,
        sourceId,
        mediaPresent: true,
        textMetadataComplete: true,
        originalStatus: 'OBSERVED',
        reviewStatus: { not: 'REJECTED' },
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        externalMessageId: true,
        text: true,
        publishedAt: true,
        editedAt: true,
        targetEvidence: true,
        contentHash: true,
      },
    });
    const messageId = Number(row?.externalMessageId);
    if (!row || !Number.isSafeInteger(messageId) || messageId < 1)
      throw new BadRequestException('LEAD_MEDIA_PILOT_OBSERVATIONS_INVALID');
    const media = await this.runtime.withLiveAccountHandle(
      source.workspaceId,
      source.accountId,
      async (handle) => {
        if (!handle.leadDiscovery?.readPhoto)
          throw new ConflictException('LEAD_CHANNEL_TRANSPORT_UNAVAILABLE');
        return handle.leadDiscovery.readPhoto(source.channelId!, {
          messageId,
          maxBytes: 5 * 1024 * 1024,
          reference: source.username ?? undefined,
        });
      },
    );
    try {
      const post = media.post;
      if (
        media.mime !== 'image/jpeg' ||
        media.data.length < 3 ||
        !media.data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
      )
        throw new BadRequestException('LEAD_MEDIA_UNAVAILABLE');
      if (
        post.text.normalize('NFC').slice(0, 4096) !== row.text ||
        post.publishedAt.getTime() !== row.publishedAt.getTime() ||
        !isDeepStrictEqual(
          extractLeadTargetEvidence(post.text, post.metadata),
          row.targetEvidence,
        ) ||
        (post.editedAt &&
          (!row.editedAt || post.editedAt.getTime() > row.editedAt.getTime()))
      )
        throw new ConflictException('LEAD_MEDIA_POST_CHANGED');
      await this.policy.refresh(userId);
      const current = await this.policy.source(userId, sourceId, 'analyze');
      this.policy.assertProcessing(current, 'ingest', true);
      this.policy.assertProcessing(current, 'ai', true);
      if (!leadTransportMatches(current, leadTransportSnapshot(source)))
        throw new ConflictException('LEAD_SOURCE_CHANGED');
      const fresh = await this.policy.prisma.telegramLeadObservation.findFirst({
        where: {
          id: observationId,
          workspaceId: source.workspaceId,
          sourceId,
          contentHash: row.contentHash,
          originalStatus: 'OBSERVED',
          reviewStatus: { not: 'REJECTED' },
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      if (!fresh) throw new ConflictException('LEAD_MEDIA_OBSERVATION_CHANGED');
      return { available: true, mime: media.mime, bytes: media.data.length };
    } finally {
      media.data.fill(0);
    }
  }

  async refresh(
    userId: string,
    sourceId: string,
    input: { beforeId?: number; limit?: number },
  ) {
    const source = await this.policy.source(userId, sourceId, 'manage');
    this.policy.assertProcessing(source, 'ingest', false);
    const job = await this.policy.prisma.telegramLeadHistoryJob.findUnique({
      where: {
        sourceId_workspaceId: { sourceId, workspaceId: source.workspaceId },
      },
      select: { cutoffAt: true, status: true },
    });
    if (!job) throw new ConflictException('LEAD_HISTORY_REQUIRED');
    if (['RUNNING', 'PAUSING'].includes(job.status))
      throw new ConflictException('LEAD_HISTORY_IN_PROGRESS');
    return this.transport.scan(userId, sourceId, {
      ...input,
      cutoffAt: job.cutoffAt,
    });
  }

  async sample(userId: string, sourceId: string, beforeId?: number) {
    const source = await this.policy.source(userId, sourceId, 'manage');
    this.policy.assertProcessing(source, 'ingest', false);
    if (!source.accountId || !source.channelId)
      throw new BadRequestException('LEAD_VALIDATE_SOURCE_FIRST');
    await this.policy.account(userId, source.accountId);
    const page = await this.runtime.withLiveAccountHandle(
      source.workspaceId,
      source.accountId,
      async (handle) => {
        if (!handle.leadDiscovery)
          throw new ConflictException('LEAD_CHANNEL_TRANSPORT_UNAVAILABLE');
        return handle.leadDiscovery.history(source.channelId!, {
          limit: 50,
          beforeId,
          reference: source.username ?? undefined,
        });
      },
    );
    await this.policy.refresh(userId);
    const current = await this.policy.source(userId, sourceId, 'manage');
    this.policy.assertProcessing(current, 'ingest', false);
    if (!leadTransportMatches(current, leadTransportSnapshot(source)))
      throw new ConflictException('LEAD_HISTORY_SOURCE_CHANGED');
    const job = await this.policy.prisma.telegramLeadHistoryJob.findUnique({
      where: {
        sourceId_workspaceId: { sourceId, workspaceId: source.workspaceId },
      },
      select: { cutoffAt: true },
    });
    const inWindow = job
      ? page.items.filter((post) => post.publishedAt >= job.cutoffAt)
      : [];
    const eligible = inWindow.filter(
      (post) =>
        /[\p{L}\p{N}]/u.test(post.text) || post.metadata?.hasMedia === true,
    );
    const stored = eligible.length
      ? await this.policy.prisma.telegramLeadObservation.findMany({
          where: {
            workspaceId: source.workspaceId,
            sourceId,
            originalStatus: 'OBSERVED',
            externalMessageId: {
              in: eligible.map((post) => String(post.messageId)),
            },
          },
          select: { externalMessageId: true },
        })
      : [];
    const storedIds = new Set(stored.map((row) => row.externalMessageId));
    const reasons: Record<string, number> = {};
    const entityTypes: Record<string, number> = {};
    const mediaTypes: Record<string, number> = {};
    let complete = 0;
    for (const { metadata } of page.items) {
      if (!metadata) {
        reasons.METADATA_UNAVAILABLE = (reasons.METADATA_UNAVAILABLE ?? 0) + 1;
        continue;
      }
      if (metadata.complete) complete++;
      for (const reason of new Set(metadata.incompleteReasons))
        reasons[reason] = (reasons[reason] ?? 0) + 1;
      for (const kind of new Set(metadata.unsupportedEntityTypes ?? []))
        entityTypes[kind] = (entityTypes[kind] ?? 0) + 1;
      if (metadata.mediaType)
        mediaTypes[metadata.mediaType] =
          (mediaTypes[metadata.mediaType] ?? 0) + 1;
    }
    return {
      count: page.items.length,
      complete,
      reasons,
      entityTypes,
      mediaTypes,
      hasMore: page.hasMore,
      nextBeforeId: page.nextBeforeId,
      historyCoverage: job
        ? {
            eligible: eligible.length,
            matched: eligible.filter((post) =>
              storedIds.has(String(post.messageId)),
            ).length,
            filtered: inWindow.length - eligible.length,
            reachedCutoff: page.items.some(
              (post) => post.publishedAt < job.cutoffAt,
            ),
          }
        : null,
    };
  }
}
