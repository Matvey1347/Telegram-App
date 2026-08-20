import { Module } from '@nestjs/common';
import { AdCampaignsModule } from '../../growth/ad-campaigns/ad-campaigns.module';
import { TelegramChannelsModule } from '../telegram-channels/telegram-channels.module';
import { DailyAnalyticsSyncService } from './daily-analytics-sync.service';
import { TelegramSyncController } from './telegram-sync.controller';
import { TelegramWorkspaceSyncTasksService } from './telegram-workspace-sync-tasks.service';
import { TelegramWorkspaceFullSyncService } from './telegram-workspace-full-sync.service';

@Module({
  imports: [TelegramChannelsModule, AdCampaignsModule],
  controllers: [TelegramSyncController],
  providers: [
    DailyAnalyticsSyncService,
    TelegramWorkspaceSyncTasksService,
    TelegramWorkspaceFullSyncService,
  ],
  exports: [
    DailyAnalyticsSyncService,
    TelegramWorkspaceSyncTasksService,
    TelegramWorkspaceFullSyncService,
  ],
})
export class TelegramSyncModule {}
