import { Injectable } from '@nestjs/common';
import { TelegramChannelDataType } from '@prisma/client';
import { DeepSyncDto } from './dto';
import { TelegramBroadcastStatsService } from './telegram-broadcast-stats.service';
import { TelegramChannelAccessService } from './telegram-channel-access.service';
import { TelegramChannelHistoricalSyncService } from './telegram-channel-historical-sync.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import { TelegramPostMetricsService } from './telegram-post-metrics.service';

@Injectable()
export class TelegramChannelDeepSyncService {
  private readonly initialPostBackfillLimit = 50;
  private readonly olderPostBackfillMaxPages = 5;

  constructor(
    private readonly telegramChannelsSupportService: TelegramChannelsSupportService,
    private readonly telegramChannelAccessService: TelegramChannelAccessService,
    private readonly telegramChannelHistoricalSyncService: TelegramChannelHistoricalSyncService,
    private readonly telegramPostMetricsService: TelegramPostMetricsService,
    private readonly telegramBroadcastStatsService: TelegramBroadcastStatsService,
  ) {}
  async deepSync(userId: string, channelId: string, dto: DeepSyncDto) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    const account = await this.telegramChannelAccessService.connectedAccount(
      workspaceId,
      channelId,
      dto.telegramUserAccountId ||
        (await this.telegramChannelAccessService.bestMtprotoAccountId(
          workspaceId,
          channelId,
          TelegramChannelDataType.STATS,
        )),
    );
    const publicInfo =
      await this.telegramChannelHistoricalSyncService.syncPublicChannelInfo(
        workspaceId,
        channelId,
        account,
      );
    const historical =
      await this.telegramChannelHistoricalSyncService.syncHistorical(
        userId,
        channelId,
        {
          telegramUserAccountId: account.id,
          syncInviteLinks: true,
          syncPosts: true,
          postLimit: dto.postLimit || this.initialPostBackfillLimit,
        },
      );
    const postsMetricsSync =
      await this.telegramPostMetricsService.syncPostsMetrics(
        userId,
        channelId,
        {
          telegramUserAccountId: account.id,
          postLimit: dto.postLimit || this.initialPostBackfillLimit,
        },
      );
    const olderPostsBackfill =
      await this.telegramPostMetricsService.syncOlderPostsMetricsBackfillForWorkspace(
        workspaceId,
        channelId,
        {
          telegramUserAccountId: account.id,
          maxPages: this.olderPostBackfillMaxPages,
        },
      );
    const channelStatsSync =
      await this.telegramBroadcastStatsService.syncBroadcastStats(
        userId,
        channelId,
        {
          telegramUserAccountId: account.id,
        },
      );
    const audienceSnapshot =
      await this.telegramChannelsSupportService.createAudienceSnapshotSafely(
        channelId,
        'sync',
      );
    const result = {
      message: 'Deep MTProto sync completed',
      source: 'mtproto',
      publicInfo,
      historical,
      postsMetricsSync,
      olderPostsBackfill,
      channelStatsSync,
      audienceSnapshot,
    };
    this.telegramChannelsSupportService.invalidateTelegramChannelReadCache(
      userId,
      workspaceId,
    );
    return result;
  }
}
