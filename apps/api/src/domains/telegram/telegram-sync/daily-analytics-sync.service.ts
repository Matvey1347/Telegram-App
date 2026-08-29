import { Injectable, Logger } from '@nestjs/common';
import { AdCampaignAnalyticsService } from '../../growth/ad-campaigns/ad-campaign-analytics.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramChannelAnalyticsService } from '../telegram-channels/telegram-channel-analytics.service';
import { TelegramPostMetricsService } from '../telegram-channels/telegram-post-metrics.service';
import { TelegramBroadcastStatsService } from '../telegram-channels/telegram-broadcast-stats.service';
import { ApplicationLoggerService } from '../../operations/application-logs/application-logger.service';

@Injectable()
export class DailyAnalyticsSyncService {
  private readonly logger = new Logger(DailyAnalyticsSyncService.name);

  constructor(
    private prisma: PrismaService,
    private telegramPostMetricsService: TelegramPostMetricsService,
    private telegramBroadcastStatsService: TelegramBroadcastStatsService,
    private telegramChannelAnalyticsService: TelegramChannelAnalyticsService,
    private adCampaignAnalyticsService: AdCampaignAnalyticsService,
    private readonly applicationLogger: ApplicationLoggerService = {
      info: () => undefined,
      writeStructured: () => undefined,
    } as unknown as ApplicationLoggerService,
  ) {}

  async runDailyAnalyticsSync(
    options: { workspaceId?: string; source?: 'cron' | 'manual' } = {},
  ) {
    const source = options.source || 'cron';
    const startedAt = Date.now();
    this.applicationLogger.info({
      kind: 'cron',
      source: DailyAnalyticsSyncService.name,
      event: 'daily_analytics.sync.started',
      message: `Daily analytics sync started from ${source}.`,
      workspaceId: options.workspaceId ?? null,
      metadata: options,
    });
    const run = await this.prisma.dailyAnalyticsSyncRun.create({
      data: {
        workspaceId: options.workspaceId || null,
        source,
        status: 'running',
      },
    });

    let channelsProcessed = 0;
    let campaignsProcessed = 0;
    let snapshotsCreated = 0;
    let errorsCount = 0;
    const errors: string[] = [];

    try {
      const workspaces = options.workspaceId
        ? [{ id: options.workspaceId }]
        : await this.prisma.workspace.findMany({ select: { id: true } });

      for (const workspace of workspaces) {
        const channels = await this.prisma.telegramChannel.findMany({
          where: {
            workspaceId: workspace.id,
            isActive: true,
            autoSyncEnabled: true,
          },
          select: {
            id: true,
            workspaceId: true,
            syncIncludePostMetrics: true,
            syncIncludeChannelStats: true,
            syncIncludeAudienceSnapshot: true,
            adminLinks: {
              orderBy: { createdAt: 'asc' },
              take: 1,
              select: { telegramUserAccountIntegrationId: true },
            },
          },
        });

        for (const channel of channels) {
          try {
            if (channel.syncIncludePostMetrics) {
              await this.telegramPostMetricsService.syncPostsMetricsForWorkspace(
                channel.workspaceId,
                channel.id,
                { postLimit: 100 },
              );
            }
            if (channel.syncIncludeChannelStats) {
              const adminLink = channel.adminLinks[0];
              if (adminLink) {
                await this.telegramBroadcastStatsService.syncBroadcastStatsForWorkspace(
                  channel.workspaceId,
                  channel.id,
                  adminLink.telegramUserAccountIntegrationId,
                );
              }
            }
            // Post-metrics sync is the canonical owner when it is selected;
            // avoid a second, identical snapshot in the same daily workflow.
            if (
              channel.syncIncludeAudienceSnapshot &&
              !channel.syncIncludePostMetrics
            ) {
              await this.telegramChannelAnalyticsService.createAudienceSnapshot(
                channel.id,
                source === 'manual' ? 'manual_daily_sync' : 'daily_cron',
              );
              snapshotsCreated += 1;
            }
            channelsProcessed += 1;
          } catch (error) {
            errorsCount += 1;
            const message = `channel=${channel.id}: ${error instanceof Error ? error.message : 'unknown error'}`;
            errors.push(message);
            this.logger.warn(`Daily analytics channel sync failed: ${message}`);
          }
        }

        const campaigns = await this.prisma.adCampaign.findMany({
          where: {
            workspaceId: workspace.id,
            excludeFromAnalytics: false,
            ...(source === 'cron'
              ? {
                  telegramChannel: {
                    is: { isActive: true, autoSyncEnabled: true },
                  },
                }
              : {}),
          },
          select: { id: true },
        });
        for (const campaign of campaigns) {
          try {
            const recalculated =
              await this.adCampaignAnalyticsService.recalculateCampaignAnalytics(
                workspace.id,
                campaign.id,
              );
            if (recalculated.changed) {
              await this.prisma.adCampaign.update({
                where: { id: campaign.id },
                data:
                  source === 'manual'
                    ? { analyticsLastManualSyncedAt: new Date() }
                    : { analyticsLastAutoSyncedAt: new Date() },
              });
            }
            campaignsProcessed += 1;
          } catch (error) {
            errorsCount += 1;
            const message = `campaign=${campaign.id}: ${error instanceof Error ? error.message : 'unknown error'}`;
            errors.push(message);
            this.logger.warn(
              `Daily analytics campaign recalc failed: ${message}`,
            );
          }
        }
      }

      const status = errorsCount > 0 ? 'partial_failed' : 'success';
      const result = await this.prisma.dailyAnalyticsSyncRun.update({
        where: { id: run.id },
        data: {
          status,
          finishedAt: new Date(),
          channelsProcessed,
          campaignsProcessed,
          snapshotsCreated,
          errorsCount,
          errorMessage: errors.slice(0, 5).join('\n') || null,
        },
      });
      this.applicationLogger.info({
        kind: 'cron',
        source: DailyAnalyticsSyncService.name,
        event: 'daily_analytics.sync.completed',
        message: `Daily analytics sync finished with status ${status}.`,
        workspaceId: options.workspaceId ?? null,
        durationMs: Date.now() - startedAt,
        metadata: result,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`Daily analytics sync failed: ${message}`);
      const result = await this.prisma.dailyAnalyticsSyncRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          channelsProcessed,
          campaignsProcessed,
          snapshotsCreated,
          errorsCount: errorsCount + 1,
          errorMessage: message,
        },
      });
      this.applicationLogger.writeStructured({
        level: 'error',
        kind: 'cron',
        source: DailyAnalyticsSyncService.name,
        event: 'daily_analytics.sync.failed',
        message,
        workspaceId: options.workspaceId ?? null,
        durationMs: Date.now() - startedAt,
        errorName: error instanceof Error ? error.name : 'Error',
        stack: error instanceof Error ? error.stack || null : null,
        metadata: result,
      });
      return result;
    }
  }
}
