import { Module } from '@nestjs/common';
import { TelegramChannelsController } from './telegram-channels.controller';
import { TelegramChannelsService } from './telegram-channels.service';
import { TelegramMtprotoClient } from '../../../telegram/shared/telegram-mtproto.client';
import { TelegramSourceAccessService } from '../../../telegram/shared/telegram-source-access.service';
import { TelegramChannelAnalyticsService } from './telegram-channel-analytics.service';
import { TelegramPostCalendarPlannerService } from './telegram-post-calendar-planner.service';
import { AdCampaignsModule } from '../../growth/ad-campaigns/ad-campaigns.module';
import { TelegramManagedPostIdentityService } from './telegram-managed-post-identity.service';
import { TelegramBotApiClient } from '../../../telegram/shared/telegram-bot-api.client';
import { TelegramChannelGptContextExporter } from './telegram-channel-gpt-context-exporter.service';
import { TelegramSystemBotConfigService } from '../telegram-system-bot/telegram-system-bot-config.service';

@Module({
  imports: [AdCampaignsModule],
  controllers: [TelegramChannelsController],
  providers: [
    TelegramChannelsService,
    TelegramChannelAnalyticsService,
    TelegramPostCalendarPlannerService,
    TelegramManagedPostIdentityService,
    TelegramMtprotoClient,
    TelegramSourceAccessService,
    TelegramBotApiClient,
    TelegramChannelGptContextExporter,
    TelegramSystemBotConfigService,
  ],
  exports: [
    TelegramChannelsService,
    TelegramChannelAnalyticsService,
    TelegramPostCalendarPlannerService,
    TelegramManagedPostIdentityService,
    TelegramMtprotoClient,
    TelegramSourceAccessService,
    TelegramChannelGptContextExporter,
  ],
})
export class TelegramChannelsModule {}
