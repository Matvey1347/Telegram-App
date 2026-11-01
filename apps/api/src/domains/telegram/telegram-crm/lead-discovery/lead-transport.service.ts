import { leadTransportSnapshot } from './lead-transport-snapshot';
import { Prisma } from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import type { LeadAvailableChannel } from '@telegram-system/shared';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TelegramCrmRuntimeManager } from '../telegram-crm-runtime-manager.service';
import { TelegramLeadTransportEvents } from '../../../../telegram/shared/mtproto/telegram-lead-transport-events';
import { TelegramLeadPolicy } from './lead-policy.service';
import { TelegramLeadReadService } from './lead-read.service';
import { TelegramLeadIngestService } from './lead-ingest.service';
import { leadLimit } from './lead-normalization';
@Injectable()
export class TelegramLeadTransportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TelegramLeadPolicy,
    private readonly runtime: TelegramCrmRuntimeManager,
    private readonly ingest: TelegramLeadIngestService,
    private readonly read: TelegramLeadReadService,
    private readonly events: TelegramLeadTransportEvents,
  ) {}
  async accounts(userId: string) {
    const { workspaceId } = await this.policy.access(userId, 'manage');
    const live = new Set(this.runtime.liveAccountIds(workspaceId));
    const rows = await this.prisma.telegramUserAccountIntegration.findMany({
      where: { workspaceId },
      select: { id: true, label: true },
      orderBy: { id: 'asc' },
      take: 100,
    });
    return rows.map((row) => ({ ...row, live: live.has(row.id) }));
  }
  async channels(
    userId: string,
    accountId: string,
    input: { cursor?: string; limit?: number },
  ) {
    const account = await this.policy.account(userId, accountId);
    if (!this.policy.enabled())
      throw new ConflictException('LEAD_DISCOVERY_DISABLED');
    const page = await this.runtime.withLiveAccountHandle(
      account.workspaceId,
      accountId,
      async (handle) => {
        if (!handle.leadDiscovery)
          throw new ConflictException('LEAD_CHANNEL_TRANSPORT_UNAVAILABLE');
        return handle.leadDiscovery.list({
          cursor: input.cursor,
          limit: leadLimit(input.limit),
        });
      },
    );
    const own = page.items.length
      ? await this.prisma.telegramChannel.findMany({
          where: {
            workspaceId: account.workspaceId,
            OR: [
              {
                telegramChatId: {
                  in: page.items.flatMap((channel) => [
                    channel.channelId,
                    `-100${channel.channelId}`,
                  ]),
                },
              },
              {
                username: {
                  in: page.items.flatMap((channel) =>
                    channel.username ? [channel.username] : [],
                  ),
                  mode: 'insensitive',
                },
              },
            ],
          },
          select: { telegramChatId: true, username: true },
        })
      : [];
    const items: LeadAvailableChannel[] = page.items
      .filter(
        (channel) =>
          !own.some(
            (row) =>
              row.telegramChatId?.replace(/^-100/, '') === channel.channelId ||
              (row.username &&
                row.username.toLowerCase() === channel.username?.toLowerCase()),
          ),
      )
      .map((channel) => ({
        channelId: channel.channelId,
        username: channel.username,
        title: channel.title,
        url: channel.url,
        isOwn: false,
        eligibleForSelection: true,
      }));
    return { ...page, items };
  }
  async validate(userId: string, id: string) {
    const source = await this.policy.source(userId, id, 'manage');
    if (
      source.monitoringState === 'DISABLED' ||
      !this.policy.granted(source, 'ingest', true)
    )
      throw new ConflictException('LEAD_PROCESSING_NOT_APPROVED');
    if (source.type !== 'TELEGRAM_CHANNEL' || !source.accountId)
      throw new BadRequestException('LEAD_TELEGRAM_ACCOUNT_REQUIRED');
    await this.policy.account(userId, source.accountId);
    try {
      const channel = await this.runtime.withLiveAccountHandle(
        source.workspaceId,
        source.accountId,
        async (handle) => {
          if (!handle.leadDiscovery)
            throw new ConflictException('LEAD_CHANNEL_TRANSPORT_UNAVAILABLE');
          return handle.leadDiscovery.resolve(
            source.channelId ??
              source.username ??
              source.url ??
              source.normalizedKey,
          );
        },
      );
      if (source.channelId && channel.channelId !== source.channelId)
        throw new ConflictException('LEAD_SOURCE_IDENTITY_CHANGED');
      await this.policy.refresh(userId);
      await this.policy.access(userId, 'manage');
      const current = await this.policy.source(userId, id, 'manage');
      if (current.updatedAt.getTime() !== source.updatedAt.getTime())
        throw new ConflictException('LEAD_SOURCE_CHANGED');
      if (!this.policy.granted(current, 'ingest', true))
        throw new ConflictException('LEAD_PROCESSING_NOT_APPROVED');
      if (
        !this.policy.granted(
          { ...source, channelId: channel.channelId },
          'ingest',
        )
      )
        throw new ConflictException({
          message: 'LEAD_RESOLVED_CHANNEL_NOT_APPROVED',
          ...(!source.channelId ? { details: { resolvedChannelId: channel.channelId } } : {}),
        });
      const own = await this.prisma.telegramChannel.findFirst({
        where: {
          workspaceId: source.workspaceId,
          OR: [
            {
              telegramChatId: {
                in: [channel.channelId, `-100${channel.channelId}`],
              },
            },
            ...(channel.username
              ? [
                  {
                    username: {
                      equals: channel.username,
                      mode: 'insensitive' as const,
                    },
                  },
                ]
              : []),
          ],
        },
        select: { id: true },
      });
      if (own && !source.allowOwnChannel)
        throw new ConflictException('LEAD_OWN_CHANNEL_NOT_APPROVED');
      if (
        channel.channelId !== source.channelId ||
        channel.username !== source.username ||
        source.accessType !==
          (channel.subscribed ? 'SUBSCRIBED_CHANNEL' : 'PUBLIC_CHANNEL') ||
        source.lastErrorCode !== null ||
        source.monitoringState === 'ACCESS_LOST'
      )
        await this.prisma.telegramLeadSource.updateMany({
          where: {
            id,
            workspaceId: source.workspaceId,
            updatedAt: source.updatedAt,
            ...leadTransportSnapshot(source),
            allowOwnChannel: source.allowOwnChannel,
          },
          data: {
            channelId: channel.channelId,
            username: channel.username,
            url: channel.url ?? source.url,
            accessType: channel.subscribed
              ? 'SUBSCRIBED_CHANNEL'
              : 'PUBLIC_CHANNEL',
            lastErrorCode: null,
            lastErrorAt: null,
            ...(source.channelPts === null && channel.pts !== null
              ? { channelPts: channel.pts }
              : {}),
            ...(!channel.subscribed || source.monitoringState === 'ACCESS_LOST'
              ? {
                  monitoringState: 'PAUSED',
                  coverageState: 'GAPPED',
                  coverageFrom: null,
                }
              : {}),
          },
        });
      this.events.refresh(source.workspaceId);
      return this.read.source(userId, id);
    } catch (error) {
      if (error instanceof Error && error.message === 'LEAD_SOURCE_CHANGED')
        throw error;
      if (
        error instanceof Error &&
        [
          'LEAD_SOURCE_IDENTITY_CHANGED',
          'LEAD_RESOLVED_CHANNEL_NOT_APPROVED',
        ].includes(error.message)
      ) {
        await this.prisma.telegramLeadSource.updateMany({
          where: {
            id,
            workspaceId: source.workspaceId,
            updatedAt: source.updatedAt,
            ...leadTransportSnapshot(source),
            allowOwnChannel: source.allowOwnChannel,
          },
          data: {
            monitoringState: 'PAUSED',
            coverageState: 'GAPPED',
            coverageFrom: null,
            lastErrorCode: error.message,
            lastErrorAt: new Date(),
          },
        });
        this.events.refresh(source.workspaceId);
        throw error;
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('LEAD_SOURCE_CANONICAL_DUPLICATE');
      await this.prisma.telegramLeadSource.updateMany({
        where: {
          id,
          workspaceId: source.workspaceId,
          updatedAt: source.updatedAt,
          ...leadTransportSnapshot(source),
          allowOwnChannel: source.allowOwnChannel,
          OR: [
            { lastErrorCode: null },
            { lastErrorCode: { not: 'LEAD_ACCESS_VALIDATION_FAILED' } },
          ],
        },
        data: {
          lastErrorCode: 'LEAD_ACCESS_VALIDATION_FAILED',
          lastErrorAt: new Date(),
          monitoringState: 'ACCESS_LOST',
          coverageState: 'GAPPED',
          coverageFrom: null,
        },
      });
      this.events.refresh(source.workspaceId);
      throw new ConflictException('LEAD_ACCESS_VALIDATION_FAILED');
    }
  }
  async scan(
    userId: string,
    id: string,
    input: { limit?: number; beforeId?: number },
  ) {
    const source = await this.policy.source(userId, id, 'manage');
    this.policy.assertProcessing(source, 'ingest', false);
    if (!source.accountId || !source.channelId)
      throw new BadRequestException('LEAD_VALIDATE_SOURCE_FIRST');
    await this.policy.account(userId, source.accountId);
    const rpcStartedAt = new Date();
    const page = await this.runtime.withLiveAccountHandle(
      source.workspaceId,
      source.accountId,
      async (handle) => {
        if (!handle.leadDiscovery)
          throw new ConflictException('LEAD_CHANNEL_TRANSPORT_UNAVAILABLE');
        return handle.leadDiscovery.history(source.channelId!, {
          limit: leadLimit(input.limit),
          beforeId: input.beforeId,
          reference: source.username ?? undefined,
        });
      },
    );
    await this.policy.refresh(userId);
    const items = page.items.map((post) => ({
      externalMessageId: String(post.messageId),
      text: post.text,
      publishedAt: post.publishedAt.toISOString(),
      messageUrl: source.username
        ? `https://t.me/${source.username}/${post.messageId}`
        : `https://t.me/c/${source.channelId}/${post.messageId}`,
    }));
    const result = items.length
      ? await this.ingest.ingest(userId, id, items, {
          expectedTransport: leadTransportSnapshot(source, true),
          rpcStartedAt,
          editedMessageDates: Object.fromEntries(
            page.items
              .filter((post) => post.editedAt)
              .map((post) => [
                String(post.messageId),
                post.editedAt!.toISOString(),
              ]),
          ),
        })
      : { received: 0, changed: 0, unchanged: 0, filtered: 0, gap: false };
    return {
      ...result,
      hasMore: page.hasMore,
      nextBeforeId: page.nextBeforeId,
    };
  }
  async recover(userId: string, id: string) {
    const source = await this.policy.source(userId, id, 'manage');
    this.policy.assertProcessing(source, 'ingest');
    if (!source.accountId || !source.channelId || source.channelPts === null)
      throw new BadRequestException('LEAD_CHECKPOINT_REQUIRED');
    const rpcStartedAt = new Date();
    const finish = this.events.beginRecovery({
      workspaceId: source.workspaceId,
      accountId: source.accountId,
      sourceId: source.id,
    });
    let success = false;
    try {
      const result = await this.runtime.withLiveAccountHandle(
        source.workspaceId,
        source.accountId,
        async (handle) => {
          if (!handle.leadDiscovery)
            throw new ConflictException('LEAD_CHANNEL_TRANSPORT_UNAVAILABLE');
          return handle.leadDiscovery.recover(
            source.channelId!,
            source.channelPts!,
            source.username ?? undefined,
          );
        },
      );
      const materials = result.posts.map((post) => ({
        externalMessageId: String(post.messageId),
        text: post.text,
        publishedAt: post.publishedAt.toISOString(),
      }));
      const deleted = result.deletedIds.map((messageId) => ({
        externalMessageId: String(messageId),
        text: '',
        publishedAt: new Date().toISOString(),
        deleted: true,
      }));
      const complete =
        result.final &&
        !result.tooLong &&
        materials.length + deleted.length <= 50;
      await this.policy.refresh(userId);
      const output = await this.ingest.ingest(
        userId,
        id,
        [...materials, ...deleted].slice(0, 50),
        {
          recovery: true,
          expectedTransport: leadTransportSnapshot(source),
          rpcStartedAt,
          editedMessageDates: Object.fromEntries(
            result.posts
              .filter((post) => post.editedAt)
              .map((post) => [
                String(post.messageId),
                post.editedAt!.toISOString(),
              ]),
          ),
          gap: !complete,
          recoveryCheckpoint: {
            sourceId: id,
            startingPts: source.channelPts,
            pts: result.pts,
            complete,
            capturedAt: rpcStartedAt,
            expectedTransport: leadTransportSnapshot(source),
          },
        },
      );

      success =
        !output.gap && !output.filtered && !output.blockedSourceIds?.length;
      return output;
    } finally {
      finish(success);
    }
  }
}
