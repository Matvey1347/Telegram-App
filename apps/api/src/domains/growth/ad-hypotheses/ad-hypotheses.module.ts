import { Module } from '@nestjs/common';
import { AdHypothesesController } from './ad-hypotheses.controller';
import { AdHypothesesService } from './ad-hypotheses.service';
import { AdHypothesisCampaignAnalyticsService } from './ad-hypothesis-campaign-analytics.service';

@Module({
  controllers: [AdHypothesesController],
  providers: [AdHypothesesService, AdHypothesisCampaignAnalyticsService],
})
export class AdHypothesesModule {}
