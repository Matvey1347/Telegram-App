import { forwardRef, Module } from '@nestjs/common';
import { FinanceCategoriesModule } from '../../finance/finance-categories/finance-categories.module';
import { TelegramChannelsModule } from '../../telegram/telegram-channels/telegram-channels.module';
import { AdCampaignAnalyticsService } from './ad-campaign-analytics.service';
import { AdCampaignAdmissionAnalyticsService } from './ad-campaign-admission-analytics.service';
import { AdCampaignAdmissionBackfillService } from './ad-campaign-admission-backfill.service';
import { AdCampaignsController } from './ad-campaigns.controller';
import { AdCampaignsService } from './ad-campaigns.service';
import { AdCampaignListReadService } from './ad-campaign-list-read.service';
import { GrowthInviteLinkReservationService } from '../invite-link-reservation.service';

@Module({
  imports: [FinanceCategoriesModule, forwardRef(() => TelegramChannelsModule)],
  controllers: [AdCampaignsController],
  providers: [
    AdCampaignsService,
    AdCampaignListReadService,
    AdCampaignAnalyticsService,
    AdCampaignAdmissionAnalyticsService,
    AdCampaignAdmissionBackfillService,
    GrowthInviteLinkReservationService,
  ],
  exports: [
    AdCampaignsService,
    AdCampaignAnalyticsService,
    AdCampaignAdmissionAnalyticsService,
    AdCampaignAdmissionBackfillService,
  ],
})
export class AdCampaignsModule {}
