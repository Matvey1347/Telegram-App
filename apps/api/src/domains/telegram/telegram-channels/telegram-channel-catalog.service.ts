import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { TelegramPublishingCapabilities } from '@telegram-system/shared';
import {
  createPaginatedResponse,
  normalizePagination,
} from '../../../common/pagination/pagination.utils';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramSourceAccessService } from '../../../telegram/shared/telegram-source-access.service';
import {
  TelegramChannelListQueryDto,
  TelegramChannelSelectQueryDto,
} from './dto';
import { TelegramChannelBookingReadService } from './telegram-channel-booking-read.service';
import { TelegramChannelFinancialReadService } from './telegram-channel-financial-read.service';

type TelegramChannelImportPolicyRow = {
  id: string;
  acquisitionType: 'CREATED' | 'PURCHASED' | null;
  postsSyncFrom: Date | null;
  inviteLinksSyncFrom: Date | null;
  purchaseTransactionId: string | null;
};
import { TelegramChannelSchemaCompatibilityService } from './telegram-channel-schema-compatibility.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';

@Injectable()
export class TelegramChannelCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sourceAccessService: TelegramSourceAccessService,
    private readonly telegramChannelsSupportService: TelegramChannelsSupportService,
    private readonly telegramChannelSchemaCompatibilityService: TelegramChannelSchemaCompatibilityService,
    private readonly telegramChannelFinancialReadService: TelegramChannelFinancialReadService,
    private readonly telegramChannelBookingReadService: TelegramChannelBookingReadService,
  ) {}

  private readonly defaultPostSyncLimit = 50;

  private readonly initialPostBackfillLimit = 50;

  private telegramChannelSyncScopeColumnsAvailable: boolean | null = null;

  public async postSyncLimitForChannel(channelId: string) {
    const [existingPosts] = await Promise.all([
      this.prisma.telegramPost.count({
        where: { telegramChannelId: channelId },
      }),
      this.getTelegramChannelImportPolicyRow({
        channelId,
      }),
    ]);
    return existingPosts > 0
      ? this.defaultPostSyncLimit
      : this.initialPostBackfillLimit;
  }

  public syncCutoffMetadata(channel: {
    postsSyncFrom?: Date | null;
    inviteLinksSyncFrom?: Date | null;
  }) {
    return {
      postsSyncFrom: channel.postsSyncFrom?.toISOString() ?? null,
      inviteLinksSyncFrom: channel.inviteLinksSyncFrom?.toISOString() ?? null,
    };
  }

  public async getTelegramChannelImportPolicyRow(params: {
    channelId: string;
    workspaceId?: string;
  }) {
    await this.telegramChannelSchemaCompatibilityService.ensureTelegramChannelImportPolicyColumnsAvailable();
    const baseSelect = Prisma.sql`
        SELECT
          "id",
          "acquisitionType",
          "postsSyncFrom",
          "inviteLinksSyncFrom",
          "purchaseTransactionId"
        FROM "TelegramChannel"
      `;
    const rows = params.workspaceId
      ? await this.prisma.$queryRaw<
          TelegramChannelImportPolicyRow[]
        >(Prisma.sql`
            ${baseSelect}
            WHERE "id" = ${params.channelId}
              AND "workspaceId" = ${params.workspaceId}
            LIMIT 1
          `)
      : await this.prisma.$queryRaw<
          TelegramChannelImportPolicyRow[]
        >(Prisma.sql`
            ${baseSelect}
            WHERE "id" = ${params.channelId}
            LIMIT 1
          `);
    return rows[0] ?? null;
  }

  public async getChannelSyncCutoffs(workspaceId: string, channelId: string) {
    const channel = await this.getTelegramChannelImportPolicyRow({
      channelId,
      workspaceId,
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    return channel;
  }

  async findAll(userId: string, query: TelegramChannelListQueryDto = {}) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    const pagination = normalizePagination(query);
    const archivedAt = query.archived ? { not: null } : null;
    const ownership =
      query.owned === true
        ? { some: {} }
        : query.owned === false
          ? { none: {} }
          : undefined;
    const where = {
      workspaceId,
      isActive: true,
      archivedAt,
      adminLinks: ownership,
    };
    const activeWhere = {
      workspaceId,
      isActive: true,
      archivedAt: null,
      adminLinks: ownership,
    };
    const archivedWhere = {
      workspaceId,
      isActive: true,
      archivedAt: { not: null },
      adminLinks: ownership,
    };
    const loadChannels = () =>
      Promise.all([
        this.prisma.telegramChannel.findMany({
          where,
          include: {
            assignedMember: WorkspaceService.assignedMemberInclude,
            createdByUser: WorkspaceService.createdByUserInclude,
            adAnalyses: {
              orderBy: { analyzedAt: 'desc' },
              take: 1,
              include: {
                assignedMember: WorkspaceService.assignedMemberInclude,
              },
            },
            _count: { select: { adAnalyses: true } },
            adminLinks: { include: { telegramUserAccountIntegration: true } },
            sourceAccesses: { select: { id: true, canPostMessages: true } },
            audienceSnapshots: {
              orderBy: { collectedAt: 'desc' },
              take: 1,
              select: {
                subscribersCount: true,
                activeSubscribersEstimate: true,
                viewRate: true,
                avgViewsAdjusted: true,
                avgReactionsAdjusted: true,
                dataQuality: true,
                dataQualityReason: true,
                hasExternalTrafficAnomaly: true,
                hasSubscriberBasePollution: true,
                postsWindow: true,
              },
            },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: pagination.skip,
          take: pagination.take,
        }),
        this.prisma.telegramChannel.count({
          where,
        }),
        this.prisma.telegramChannel.count({
          where: activeWhere,
        }),
        this.prisma.telegramChannel.count({
          where: archivedWhere,
        }),
      ]);
    let channels;
    let totalItems;
    let activeCount;
    let archivedCount;
    try {
      [channels, totalItems, activeCount, archivedCount] = await loadChannels();
    } catch (error) {
      if (
        !this.telegramChannelSchemaCompatibilityService.isMissingTelegramChannelSyncScopeColumn(
          error,
        )
      )
        throw error;
      this.telegramChannelSyncScopeColumnsAvailable = false;
      await this.telegramChannelSchemaCompatibilityService.ensureTelegramChannelSyncScopeColumnsAvailable();
      [channels, totalItems, activeCount, archivedCount] = await loadChannels();
    }

    if (!channels.length) {
      return {
        ...createPaginatedResponse([], totalItems, pagination),
        counts: { active: activeCount, archived: archivedCount },
      };
    }

    const channelIds = channels.map((channel) => channel.id);
    const [
      timePostsByChannel,
      financialSummaryByChannel,
      bookingSummaryByChannel,
    ] = await Promise.all([
      this.telegramChannelSchemaCompatibilityService.timePostsByChannelIds(
        channelIds,
      ),
      this.telegramChannelFinancialReadService.buildChannelFinancialSummaryPreview(
        workspaceId,
        channels,
      ),
      this.telegramChannelBookingReadService.summariesForChannels(
        workspaceId,
        channelIds,
      ),
    ]);

    const items = channels.map((channel) => {
      const {
        sourceAccesses,
        audienceSnapshots,
        adAnalyses,
        _count,
        ...channelData
      } = channel;
      const snapshot = audienceSnapshots[0];
      const reactionRate =
        snapshot?.avgViewsAdjusted != null && snapshot.avgViewsAdjusted > 0
          ? ((snapshot.avgReactionsAdjusted ?? 0) / snapshot.avgViewsAdjusted) *
            100
          : null;
      const audience = {
        subscribersCount:
          snapshot?.subscribersCount ?? channel.currentSubscribersCount ?? null,
        activeSubscribersEstimate: snapshot?.activeSubscribersEstimate ?? null,
        paidActiveSubscribersEstimate:
          snapshot?.activeSubscribersEstimate ?? null,
        viewRate: snapshot?.viewRate ?? null,
        reactionRate,
        dataQuality: snapshot?.dataQuality ?? null,
        dataQualityReason: snapshot?.dataQualityReason ?? null,
        dataQualityWarning: null,
        rawViewRate: null,
        subscriberBaseQuality: null,
        hasExternalTrafficAnomaly: snapshot?.hasExternalTrafficAnomaly ?? false,
        hasSubscriberBasePollution:
          snapshot?.hasSubscriberBasePollution ?? false,
        postsWindow: snapshot?.postsWindow ?? channel.activeSubscribersWindow,
      };
      const financialSummary = financialSummaryByChannel.get(channel.id) ?? {
        acquisitionCost: 0,
        totalSpend: 0,
        totalAdSpend: 0,
        campaignsCount: 0,
        totalJoinedSubscribers: 0,
        avgCpa: null,
        activeSubscribersEstimate: audience.activeSubscribersEstimate,
        paidActiveSubscribersEstimate:
          audience.paidActiveSubscribersEstimate ?? 0,
        activeCpa: null,
        avgActiveRate: null,
        avgRetention7d: null,
        dataQuality: audience.dataQuality,
        dataQualityReason: audience.dataQualityReason,
        dataQualityWarning: null,
        hasExternalTrafficAnomaly: audience.hasExternalTrafficAnomaly,
        hasSubscriberBasePollution: audience.hasSubscriberBasePollution,
        kpiStatus: 'unknown' as const,
        kpiLabel: '-',
      };

      return {
        ...channelData,
        timePosts: timePostsByChannel.get(channel.id) ?? [],
        preview: {
          audience,
          sourcesCount: sourceAccesses.length || channel.adminLinks.length,
          canPostMessages: sourceAccesses.some(
            (source) => source.canPostMessages,
          ),
          adAnalysis: {
            latest: adAnalyses[0] ?? null,
            historyCount: _count.adAnalyses,
            metrics: adAnalyses[0]
              ? {
                  avgViews: adAnalyses[0].avgViews,
                  avgReactions: adAnalyses[0].avgReactions,
                  avgForwards: adAnalyses[0].avgForwards,
                  postsCount: adAnalyses[0].postsCount,
                  cpm: adAnalyses[0].cpm,
                }
              : undefined,
          },
          financialSummary,
          bookingSchedule: bookingSummaryByChannel.get(channel.id) ?? {
            futureScheduledTotal: 0,
            lastScheduledAt: null,
            nextAvailableDate: null,
            bookedThroughDate: null,
          },
        },
      };
    });
    return {
      ...createPaginatedResponse(items, totalItems, pagination),
      counts: { active: activeCount, archived: archivedCount },
    };
  }

  async selectOptions(
    userId: string,
    query: TelegramChannelSelectQueryDto = {},
  ) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    const channels = await this.prisma.telegramChannel.findMany({
      where: { workspaceId, isActive: true, archivedAt: null },
      select: {
        id: true,
        title: true,
        username: true,
        telegramChatId: true,
        photoUrl: true,
        isActive: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    if (!channels.length) return [];

    const channelIds = channels.map((channel) => channel.id);
    const [timePostsByChannel, publishingCapabilitiesByChannel] =
      await Promise.all([
        this.telegramChannelSchemaCompatibilityService.timePostsByChannelIds(
          channelIds,
        ),
        this.sourceAccessService.publishingCapabilitiesForChannels(
          workspaceId,
          channelIds,
        ),
      ]);

    return channels
      .map((channel) => {
        const publishingCapabilities = publishingCapabilitiesByChannel.get(
          channel.id,
        ) ?? {
          source: null,
          captionLengthMax: 1024,
          messageLengthMax: 4096,
          maxUploadFileSizeMb: null,
          supportsCustomEmoji: false,
          canPublishInlineButtons: false,
          checkedAt: null,
          isFallback: true,
        };

        return {
          ...channel,
          timePosts: timePostsByChannel.get(channel.id) ?? [],
          canPostMessages: Boolean(publishingCapabilities.source),
          publishingCapabilities,
        };
      })
      .filter((channel) =>
        query.canPostMessagesOnly ? channel.canPostMessages : true,
      );
  }

  async findOne(userId: string, id: string) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    const loadChannel = () =>
      (this.prisma.telegramChannel as any).findFirst({
        where: { id, workspaceId },
        include: {
          adminLinks: { include: { telegramUserAccountIntegration: true } },
          assignedMember: WorkspaceService.assignedMemberInclude,
          createdByUser: WorkspaceService.createdByUserInclude,
        },
      });
    let channel;
    let timePostsByChannel;
    try {
      [channel, timePostsByChannel] = await Promise.all([
        loadChannel(),
        this.telegramChannelSchemaCompatibilityService.timePostsByChannelIds([
          id,
        ]),
      ]);
    } catch (error) {
      if (
        !this.telegramChannelSchemaCompatibilityService.isMissingTelegramChannelSyncScopeColumn(
          error,
        )
      )
        throw error;
      this.telegramChannelSyncScopeColumnsAvailable = false;
      await this.telegramChannelSchemaCompatibilityService.ensureTelegramChannelSyncScopeColumnsAvailable();
      [channel, timePostsByChannel] = await Promise.all([
        loadChannel(),
        this.telegramChannelSchemaCompatibilityService.timePostsByChannelIds([
          id,
        ]),
      ]);
    }
    if (!channel) throw new NotFoundException('Telegram channel not found');
    const importPolicy = await this.getTelegramChannelImportPolicyRow({
      channelId: channel.id,
      workspaceId,
    });
    let purchaseTransaction: {
      id: string;
      amount: Prisma.Decimal;
      currency: string;
      amountInPrimaryCurrency: Prisma.Decimal;
      date: Date;
      description: string | null;
      account: {
        id: string;
        name: string;
      } | null;
    } | null = null;
    const purchaseTransactionId = importPolicy?.purchaseTransactionId ?? null;
    if (purchaseTransactionId) {
      purchaseTransaction = await this.prisma.transaction.findFirst({
        where: { id: purchaseTransactionId, workspaceId },
        select: {
          id: true,
          amount: true,
          currency: true,
          amountInPrimaryCurrency: true,
          date: true,
          description: true,
          account: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
    }
    return {
      ...channel,
      acquisitionType: importPolicy?.acquisitionType ?? 'CREATED',
      postsSyncFrom: importPolicy?.postsSyncFrom ?? null,
      inviteLinksSyncFrom: importPolicy?.inviteLinksSyncFrom ?? null,
      purchaseTransactionId,
      purchaseTransaction,
      timePosts: timePostsByChannel.get(channel.id) ?? [],
    };
  }

  async channelSources(userId: string, channelId: string) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    await this.findOne(userId, channelId);
    return this.sourceAccessService.sourcesForChannel(workspaceId, channelId);
  }

  async publishingCapabilities(
    userId: string,
    channelId: string,
  ): Promise<TelegramPublishingCapabilities> {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    await this.findOne(userId, channelId);
    return this.sourceAccessService.publishingCapabilitiesForChannel(
      workspaceId,
      channelId,
    );
  }

  async analyticsSources(userId: string, channelId: string) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    await this.findOne(userId, channelId);
    return this.sourceAccessService.analyticsSources(workspaceId, channelId);
  }
}
