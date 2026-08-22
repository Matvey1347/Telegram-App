import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TelegramChannelDataType } from '@prisma/client';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CreateTelegramChannelAdAnalysisDto,
  UpdateTelegramChannelAdAnalysisDto,
  UpdateTelegramPostManualMetricsDto,
} from './dto';
import { TelegramChannelAccessService } from './telegram-channel-access.service';
import { TelegramChannelAnalyticsService } from './telegram-channel-analytics.service';
import { TelegramChannelCatalogService } from './telegram-channel-catalog.service';
import { TelegramChannelFinancialReadService } from './telegram-channel-financial-read.service';
import { TelegramChannelHistoricalSyncService } from './telegram-channel-historical-sync.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import { TelegramPostMetricsService } from './telegram-post-metrics.service';

@Injectable()
export class TelegramChannelInsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly analyticsService: TelegramChannelAnalyticsService,
    private readonly telegramChannelsSupportService: TelegramChannelsSupportService,
    private readonly telegramChannelAccessService: TelegramChannelAccessService,
    private readonly telegramChannelFinancialReadService: TelegramChannelFinancialReadService,
    private readonly telegramChannelCatalogService: TelegramChannelCatalogService,
    private readonly telegramChannelHistoricalSyncService: TelegramChannelHistoricalSyncService,
    private readonly telegramPostMetricsService: TelegramPostMetricsService,
  ) {}
  private readonly logger = new Logger('TelegramChannelsService');

  async adAnalyses(userId: string, channelId: string) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    await this.telegramChannelCatalogService.findOne(userId, channelId);
    return this.prisma.telegramChannelAdAnalysis.findMany({
      where: { workspaceId, telegramChannelId: channelId },
      include: {
        assignedMember: WorkspaceService.assignedMemberInclude,
      },
      orderBy: { analyzedAt: 'desc' },
    });
  }

  async createAdAnalysis(
    userId: string,
    channelId: string,
    dto: CreateTelegramChannelAdAnalysisDto,
  ) {
    const { workspaceId, assignedMemberId } =
      await this.workspaceService.resolveAssignedMemberId(
        userId,
        dto.assignedMemberId,
      );
    const channel = await (this.prisma.telegramChannel as any).findFirst({
      where: { id: channelId, workspaceId, isActive: true },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');

    let warning: string | null = null;
    if (channel.username || channel.telegramChatId) {
      try {
        const account =
          await this.telegramChannelAccessService.connectedAccount(
            workspaceId,
            channelId,
            await this.telegramChannelAccessService.bestMtprotoAccountId(
              workspaceId,
              channelId,
              TelegramChannelDataType.POSTS,
            ),
          );
        await this.telegramChannelHistoricalSyncService.syncPublicChannelInfo(
          workspaceId,
          channelId,
          account,
        );
        await this.telegramPostMetricsService.syncPostsMetricsForWorkspace(
          workspaceId,
          channelId,
          {
            telegramUserAccountId: account.id,
            postLimit: dto.postLimit ?? 20,
          },
        );
      } catch (error) {
        warning =
          error instanceof Error
            ? error.message
            : 'Telegram post metrics sync failed';
        this.logger.warn(
          `Ad analysis continues without fresh sync for channel=${channelId}: ${warning}`,
        );
      }
    }

    const metrics =
      await this.telegramChannelFinancialReadService.calculateAdAnalysisMetrics(
        workspaceId,
        channelId,
        dto.postLimit,
        dto.price,
      );
    const analysis = await this.prisma.telegramChannelAdAnalysis.create({
      data: {
        workspaceId,
        telegramChannelId: channelId,
        assignedMemberId,
        analyzedAt: new Date(dto.analyzedAt),
        status: dto.status,
        verdict: dto.verdict?.trim() || null,
        price: dto.price,
        currency: (dto.currency || 'USD').trim().toUpperCase(),
        reasonTags: dto.reasonTags ?? [],
        reasonSummary: dto.reasonSummary?.trim() || null,
        notes: dto.notes?.trim() || null,
        nextReviewAt: dto.nextReviewAt ? new Date(dto.nextReviewAt) : null,
        ...metrics,
      },
      include: {
        assignedMember: WorkspaceService.assignedMemberInclude,
      },
    });
    return { ...analysis, warning };
  }

  async updateAdAnalysis(
    userId: string,
    channelId: string,
    analysisId: string,
    dto: UpdateTelegramChannelAdAnalysisDto,
  ) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    const existing = await this.prisma.telegramChannelAdAnalysis.findFirst({
      where: { id: analysisId, workspaceId, telegramChannelId: channelId },
    });
    if (!existing) throw new NotFoundException('Ad analysis not found');
    const assignedMemberId =
      dto.assignedMemberId === undefined
        ? undefined
        : (
            await this.workspaceService.resolveAssignedMemberId(
              userId,
              dto.assignedMemberId,
            )
          ).assignedMemberId;
    const price =
      dto.price === undefined
        ? existing.price == null
          ? null
          : Number(existing.price)
        : dto.price;
    const metrics =
      await this.telegramChannelFinancialReadService.calculateAdAnalysisMetrics(
        workspaceId,
        channelId,
        dto.postLimit,
        price,
      );
    return this.prisma.telegramChannelAdAnalysis.update({
      where: { id: analysisId },
      data: {
        assignedMemberId,
        analyzedAt: dto.analyzedAt ? new Date(dto.analyzedAt) : undefined,
        status: dto.status,
        verdict:
          dto.verdict === undefined ? undefined : dto.verdict.trim() || null,
        price: dto.price,
        currency: dto.currency?.trim().toUpperCase(),
        reasonTags: dto.reasonTags,
        reasonSummary:
          dto.reasonSummary === undefined
            ? undefined
            : dto.reasonSummary.trim() || null,
        notes: dto.notes === undefined ? undefined : dto.notes.trim() || null,
        nextReviewAt:
          dto.nextReviewAt === undefined
            ? undefined
            : new Date(dto.nextReviewAt),
        ...metrics,
      },
      include: {
        assignedMember: WorkspaceService.assignedMemberInclude,
      },
    });
  }

  async deleteAdAnalysis(
    userId: string,
    channelId: string,
    analysisId: string,
  ) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    const existing = await this.prisma.telegramChannelAdAnalysis.findFirst({
      where: { id: analysisId, workspaceId, telegramChannelId: channelId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Ad analysis not found');
    return this.prisma.telegramChannelAdAnalysis.delete({
      where: { id: analysisId },
    });
  }

  async audience(userId: string, channelId: string) {
    await this.telegramChannelCatalogService.findOne(userId, channelId);
    return this.analyticsService.getActiveAudienceEstimate(channelId);
  }

  async createAudienceSnapshot(
    userId: string,
    channelId: string,
    source = 'manual',
  ) {
    await this.telegramChannelCatalogService.findOne(userId, channelId);
    return this.analyticsService.createAudienceSnapshot(channelId, source);
  }

  async audienceSnapshots(userId: string, channelId: string, limit = 50) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    await this.telegramChannelCatalogService.findOne(userId, channelId);
    const safeLimit = Math.max(1, Math.min(200, limit));
    const rows = await this.prisma.telegramChannelAudienceSnapshot.findMany({
      where: { workspaceId, telegramChannelId: channelId },
      orderBy: { collectedAt: 'desc' },
      take: safeLimit,
    });
    return rows.reverse();
  }

  async financialSummary(userId: string, channelId: string) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId },
      include: {
        audienceSnapshots: {
          orderBy: { collectedAt: 'desc' },
          take: 1,
          select: {
            activeSubscribersEstimate: true,
            dataQuality: true,
            dataQualityReason: true,
            hasExternalTrafficAnomaly: true,
            hasSubscriberBasePollution: true,
          },
        },
      },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    const summaries =
      await this.telegramChannelFinancialReadService.buildChannelFinancialSummaryPreview(
        workspaceId,
        [channel],
      );
    return summaries.get(channelId);
  }

  async updatePostManualMetrics(
    userId: string,
    channelId: string,
    postId: string,
    dto: UpdateTelegramPostManualMetricsDto,
  ) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    await this.telegramChannelCatalogService.findOne(userId, channelId);
    const post = await this.prisma.telegramPost.findFirst({
      where: { id: postId, workspaceId, telegramChannelId: channelId },
    });
    if (!post) throw new NotFoundException('Telegram post not found');
    return this.prisma.telegramPost.update({
      where: { id: post.id },
      data: {
        manualOwnViews: dto.manualOwnViews,
        manualOwnReactions: dto.manualOwnReactions,
        excludeFromAnalytics: dto.excludeFromAnalytics,
      },
    });
  }
}
