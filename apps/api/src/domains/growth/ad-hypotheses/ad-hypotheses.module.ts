import { Module } from '@nestjs/common';
import { AdHypothesesController } from './ad-hypotheses.controller';
import { AdHypothesesService } from './ad-hypotheses.service';
import { AdHypothesisCampaignAnalyticsService } from './ad-hypothesis-campaign-analytics.service';
import { AdSystemHypothesesService } from './ad-system-hypotheses.service';

@Module({
  controllers: [AdHypothesesController],
  providers: [
    AdHypothesesService,
    AdHypothesisCampaignAnalyticsService,
    AdSystemHypothesesService,
  ],
})
export class AdHypothesesModule {}
