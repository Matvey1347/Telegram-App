import { IsBoolean } from 'class-validator';

export class AdHypothesisCampaignAnalyticsInputDto {
  @IsBoolean()
  excludeFromAnalytics!: boolean;
}
