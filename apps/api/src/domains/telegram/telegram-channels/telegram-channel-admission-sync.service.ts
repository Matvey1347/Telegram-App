import { Injectable } from '@nestjs/common';
import type { SyncStepResult } from '@telegram-system/shared';
import { AdCampaignAdmissionAnalyticsService } from '../../growth/ad-campaigns/ad-campaign-admission-analytics.service';
import { AdCampaignAdmissionBackfillService } from '../../growth/ad-campaigns/ad-campaign-admission-backfill.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import type { TelegramChannelSyncSelection } from './telegram-channels.internal';

@Injectable()
export class TelegramChannelAdmissionSyncService {
  constructor(
    private readonly analytics: AdCampaignAdmissionAnalyticsService,
    private readonly backfill: AdCampaignAdmissionBackfillService,
    private readonly support: TelegramChannelsSupportService,
  ) {}

  async process(params: {
    workspaceId: string;
    channelId: string;
    syncStartedAt: Date;
    selection: TelegramChannelSyncSelection;
    steps: SyncStepResult[];
  }) {
    const startedAt = Date.now();
    try {
      if (!this.analytics || !this.backfill) {
        const result = {
          status: 'skipped',
          backfilledCampaigns: 0,
          createdBatches: 0,
          createdPoints: 0,
          reason: 'admission analytics service unavailable',
        };
        params.steps.push(
          this.support.syncStepSkipped(
            'admission_analytics',
            startedAt,
            'Admission analytics service unavailable',
          ),
        );
        return result;
      }
      const result = await this.analytics.processCompletedChannelSync({
        workspaceId: params.workspaceId,
        telegramChannelId: params.channelId,
        syncStartedAt: params.syncStartedAt,
        syncCompletedAt: new Date(),
        inviteLinksSynced: Boolean(params.selection.syncIncludeInviteLinks),
        postMetricsSynced: Boolean(params.selection.syncIncludePostMetrics),
        backfill: (backfillParams) =>
          this.backfill.backfillChannelCampaigns(backfillParams),
      });
      params.steps.push(
        result.status === 'skipped'
          ? this.support.syncStepSkipped(
              'admission_analytics',
              startedAt,
              result.reason || 'Admission analytics skipped',
              result,
            )
          : this.support.syncStepSuccess(
              'admission_analytics',
              startedAt,
              'Admission analytics processed',
              result,
            ),
      );
      return result;
    } catch (error) {
      this.analytics?.logFailure(error);
      const result = {
        status: 'failed',
        backfilledCampaigns: 0,
        createdBatches: 0,
        createdPoints: 0,
        reason:
          error instanceof Error ? error.message : 'Admission analytics failed',
      };
      params.steps.push(
        this.support.syncStepFailure(
          'admission_analytics',
          startedAt,
          error,
          'ADMISSION_ANALYTICS_FAILED',
          'Admission analytics failed',
        ),
      );
      return result;
    }
  }
}
