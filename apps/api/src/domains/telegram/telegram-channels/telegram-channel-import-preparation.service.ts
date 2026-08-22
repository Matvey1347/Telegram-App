import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { TelegramUserAccountStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  type ResolvedTelegramEntity,
  type TelegramImportInput,
} from '../../../telegram/shared/telegram-import.helpers';
import { TelegramMtprotoClient } from '../../../telegram/shared/telegram-mtproto.client';
import { TelegramBroadcastStatsService } from './telegram-broadcast-stats.service';
import { TelegramChannelAccessService } from './telegram-channel-access.service';
import { TelegramChannelCatalogService } from './telegram-channel-catalog.service';
import { TelegramChannelHistoricalSyncService } from './telegram-channel-historical-sync.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import { BulkProgressCallback } from './telegram-channels.internal';
import { TelegramPostMetricsService } from './telegram-post-metrics.service';

@Injectable()
export class TelegramChannelImportPreparationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mtprotoClient: TelegramMtprotoClient,
    private readonly telegramChannelsSupportService: TelegramChannelsSupportService,
    private readonly telegramChannelAccessService: TelegramChannelAccessService,
    private readonly telegramChannelCatalogService: TelegramChannelCatalogService,
    private readonly telegramChannelHistoricalSyncService: TelegramChannelHistoricalSyncService,
    private readonly telegramPostMetricsService: TelegramPostMetricsService,
    private readonly telegramBroadcastStatsService: TelegramBroadcastStatsService,
  ) {}

  private readonly logger = new Logger('TelegramChannelsService');

  private readonly initialPostBackfillLimit = 50;

  private readonly olderPostBackfillMaxPages = 5;

  public importProgressSteps(inputType: TelegramImportInput['type']) {
    if (inputType === 'invite') {
      return [
        'Parsing import input',
        'Checking private invite',
        'Resolving Telegram channel',
        'Adding channel to workspace',
        'Importing channel history and metrics',
      ] as const;
    }
    return [
      'Parsing import input',
      'Resolving Telegram channel',
      'Adding channel to workspace',
      'Importing channel history and metrics',
    ] as const;
  }

  public async notifyImportProgress(
    onProgress: BulkProgressCallback | undefined,
    steps: readonly string[],
    index: number,
  ) {
    await this.telegramChannelsSupportService.notifyTaskProgress(
      onProgress,
      index + 1,
      steps.length,
      steps[index],
    );
  }

  public ensureImportableChannelEntity(
    info: ResolvedTelegramEntity,
    inputType: TelegramImportInput['type'],
  ) {
    if (info.kind === 'channel' && !String(info.telegramChatId || '').trim()) {
      if (inputType === 'invite') {
        throw new BadRequestException(
          'Could not resolve a real Telegram channel from the invite link.',
        );
      }
      throw new BadRequestException(
        'Could not resolve a real Telegram channel for import.',
      );
    }
    return info;
  }

  public async resolveImportEntity(
    account: {
      id: string;
      apiId: string;
      apiHashEncrypted: string;
      apiHashIv: string;
      apiHashAuthTag: string;
      sessionEncrypted: string | null;
      sessionIv: string | null;
      sessionAuthTag: string | null;
    },
    input: TelegramImportInput,
  ) {
    const credentials =
      this.telegramChannelAccessService.accountCredentials(account);
    if (input.type === 'title') {
      return this.mtprotoClient.findAccessibleChannelInfoByTitle({
        ...credentials,
        titleQuery: input.titleQuery,
      });
    }
    if (input.type === 'invite') {
      return this.mtprotoClient.getPublicChannelInfo({
        ...credentials,
        channelRef: input.inviteLink,
        inviteHash: input.inviteHash,
      });
    }
    return this.mtprotoClient.getPublicChannelInfo({
      ...credentials,
      channelRef: input.channelRef,
    });
  }

  public async runInitialImportBackfill(params: {
    userId: string;
    workspaceId: string;
    channelId: string;
    accountId: string;
  }) {
    try {
      const cutoffs =
        await this.telegramChannelCatalogService.getChannelSyncCutoffs(
          params.workspaceId,
          params.channelId,
        );
      const historical =
        await this.telegramChannelHistoricalSyncService.syncHistorical(
          params.userId,
          params.channelId,
          {
            telegramUserAccountId: params.accountId,
            syncInviteLinks: true,
            syncPosts: true,
            postLimit: this.initialPostBackfillLimit,
          },
        );
      const postsMetricsSync =
        await this.telegramPostMetricsService.syncPostsMetricsForWorkspace(
          params.workspaceId,
          params.channelId,
          {
            telegramUserAccountId: params.accountId,
            postLimit: this.initialPostBackfillLimit,
          },
        );
      const olderPostsBackfill =
        await this.telegramPostMetricsService.syncOlderPostsMetricsBackfillForWorkspace(
          params.workspaceId,
          params.channelId,
          {
            telegramUserAccountId: params.accountId,
            maxPages: this.olderPostBackfillMaxPages,
          },
        );
      const channelStatsSync =
        await this.telegramBroadcastStatsService.syncBroadcastStatsForWorkspace(
          params.workspaceId,
          params.channelId,
          params.accountId,
        );
      return {
        success: true,
        ...this.telegramChannelCatalogService.syncCutoffMetadata(cutoffs),
        historical,
        postsMetricsSync,
        olderPostsBackfill,
        channelStatsSync,
      };
    } catch (error) {
      this.logger.warn(
        `Initial Telegram import backfill skipped for channel=${params.channelId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : 'unknown error',
      };
    }
  }

  public async firstConnectedAccount(workspaceId: string) {
    const account = await this.prisma.telegramUserAccountIntegration.findFirst({
      where: {
        workspaceId,
        isActive: true,
        status: TelegramUserAccountStatus.connected,
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!account) {
      throw new BadRequestException(
        'Connect an active Telegram user account before importing public channels',
      );
    }
    return account;
  }

  public async findMatchingChannels(
    workspaceId: string,
    username: string | null,
    telegramChatId: string | null,
  ) {
    if (!username && !telegramChatId) return [];
    const normalizedChatId =
      this.telegramChannelsSupportService.normalizeChatId(telegramChatId);
    const candidates = await this.prisma.telegramChannel.findMany({
      where: {
        workspaceId,
        OR: [
          ...(username ? [{ username: { not: null } }] : []),
          ...(telegramChatId ? [{ telegramChatId: { not: null } }] : []),
        ],
      },
      include: { adminLinks: true },
      orderBy: { createdAt: 'asc' },
    });
    return candidates.filter((channel) => {
      const sameUsername =
        username &&
        this.telegramChannelsSupportService.normalizeUsername(
          channel.username,
        ) === username;
      const sameChatId =
        normalizedChatId &&
        this.telegramChannelsSupportService.normalizeChatId(
          channel.telegramChatId,
        ) === normalizedChatId;
      return Boolean(sameUsername || sameChatId);
    });
  }

  public async upsertImportedPerson(
    workspaceId: string,
    info: {
      title: string;
      username: string | null;
      description?: string | null;
      photoUrl?: string | null;
    },
  ) {
    const existing = info.username
      ? await this.prisma.advertisingSource.findFirst({
          where: {
            workspaceId,
            type: { not: 'telegram_channel' },
            telegramUsername: info.username,
          },
        })
      : null;
    const data = {
      workspaceId,
      name: info.title,
      type: 'direct' as const,
      url: info.username ? `https://t.me/${info.username}` : undefined,
      telegramUsername: info.username || undefined,
      description: info.description || undefined,
      imageUrl: info.photoUrl || undefined,
      subscribersCount: 0,
    };
    const row = existing
      ? await this.prisma.advertisingSource.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.advertisingSource.create({ data });
    return {
      id: row.id,
      selectionId: `source:${row.id}`,
      kind: 'person',
      title: row.name,
      telegramUrl: row.url,
      username: row.telegramUsername,
      contactInfo: row.contactInfo,
      notes: row.notes,
      imageUrl: row.imageUrl,
      subscribersCount: 0,
      channelTags: Array.isArray(row.channelTags) ? row.channelTags : [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  public pickCanonicalChannel(
    channels: Array<{ id: string; adminLinks?: unknown[]; createdAt: Date }>,
  ) {
    return [...channels].sort((left, right) => {
      const leftAdmin = (left.adminLinks?.length || 0) > 0 ? 0 : 1;
      const rightAdmin = (right.adminLinks?.length || 0) > 0 ? 0 : 1;
      if (leftAdmin !== rightAdmin) return leftAdmin - rightAdmin;
      return left.createdAt.getTime() - right.createdAt.getTime();
    })[0];
  }

  public async mergeDuplicateChannels(
    tx: any,
    workspaceId: string,
    canonicalId: string,
    duplicateIds: string[],
  ) {
    if (!duplicateIds.length) return;
    const adminLinks = await tx.telegramChannelAdminLink.findMany({
      where: { workspaceId, telegramChannelId: { in: duplicateIds } },
      select: { telegramUserAccountIntegrationId: true, source: true },
    });
    if (adminLinks.length) {
      await tx.telegramChannelAdminLink.createMany({
        data: adminLinks.map((link: any) => ({
          workspaceId,
          telegramChannelId: canonicalId,
          telegramUserAccountIntegrationId:
            link.telegramUserAccountIntegrationId,
          source: link.source || 'mtproto',
        })),
        skipDuplicates: true,
      });
    }

    const placements = await tx.adCampaignTelegramChannelPlacement.findMany({
      where: { telegramChannelId: { in: duplicateIds } },
      select: { adCampaignId: true },
    });
    if (placements.length) {
      await tx.adCampaignTelegramChannelPlacement.createMany({
        data: placements.map((placement: any) => ({
          adCampaignId: placement.adCampaignId,
          telegramChannelId: canonicalId,
        })),
        skipDuplicates: true,
      });
    }

    await tx.telegramChannelAdminLink.deleteMany({
      where: { workspaceId, telegramChannelId: { in: duplicateIds } },
    });
    await tx.adCampaignTelegramChannelPlacement.deleteMany({
      where: { telegramChannelId: { in: duplicateIds } },
    });
    await tx.adCampaign.updateMany({
      where: { workspaceId, telegramChannelId: { in: duplicateIds } },
      data: { telegramChannelId: canonicalId },
    });
    await tx.telegramInviteLink.updateMany({
      where: { workspaceId, telegramChannelId: { in: duplicateIds } },
      data: { telegramChannelId: canonicalId },
    });
    await tx.promo.updateMany({
      where: { workspaceId, telegramChannelId: { in: duplicateIds } },
      data: { telegramChannelId: canonicalId },
    });
    await tx.telegramChannel.updateMany({
      where: { workspaceId, id: { in: duplicateIds } },
      data: { isActive: false },
    });
  }
}
