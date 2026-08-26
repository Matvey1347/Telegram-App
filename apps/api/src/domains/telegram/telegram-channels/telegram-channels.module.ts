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
import { TelegramBroadcastStatsService } from './telegram-broadcast-stats.service';
import { TelegramChannelAdmissionSyncService } from './telegram-channel-admission-sync.service';
import { TelegramChannelAccessService } from './telegram-channel-access.service';
import { TelegramChannelCatalogService } from './telegram-channel-catalog.service';
import { TelegramChannelFinancialReadService } from './telegram-channel-financial-read.service';
import { TelegramChannelBookingReadService } from './telegram-channel-booking-read.service';
import { TelegramChannelAdPricingReadService } from './telegram-channel-ad-pricing-read.service';
import { TelegramChannelHistoricalSyncService } from './telegram-channel-historical-sync.service';
import { TelegramChannelImportPolicyService } from './telegram-channel-import-policy.service';
import { TelegramChannelImportService } from './telegram-channel-import.service';
import { TelegramChannelImportPreparationService } from './telegram-channel-import-preparation.service';
import { TelegramChannelInsightsService } from './telegram-channel-insights.service';
import { TelegramChannelLifecycleService } from './telegram-channel-lifecycle.service';
import { TelegramChannelReadModelsService } from './telegram-channel-read-models.service';
import { TelegramChannelContentReadService } from './telegram-channel-content-read.service';
import { TelegramChannelDeepSyncService } from './telegram-channel-deep-sync.service';
import { TelegramInviteCampaignService } from './telegram-invite-campaign.service';
import { TelegramManagedPostCalendarService } from './telegram-managed-post-calendar.service';
import { TelegramManagedPostDeletionService } from './telegram-managed-post-deletion.service';
import { TelegramManagedPostGroupBulkService } from './telegram-managed-post-group-bulk.service';
import { TelegramManagedPostLinksService } from './telegram-managed-post-links.service';
import { TelegramManagedPostImportService } from './telegram-managed-post-import.service';
import { TelegramManagedPostImportParserService } from './telegram-managed-post-import-parser.service';
import { TelegramChannelSchemaCompatibilityService } from './telegram-channel-schema-compatibility.service';
import { TelegramChannelSyncOrchestrator } from './telegram-channel-sync.orchestrator';
import { TelegramChannelSyncResultService } from './telegram-channel-sync-result.service';
import { TelegramChannelWorkbookExportService } from './telegram-channel-workbook-export.service';
import { TelegramChannelWorkbookDataService } from './telegram-channel-workbook-data.service';
import { TelegramChannelWorkbookWriter } from './telegram-channel-workbook.writer';
import { TelegramChannelWorkbookSheetWriter } from './telegram-channel-workbook-sheet.writer';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import { TelegramInviteAttributionService } from './telegram-invite-attribution.service';
import { TelegramInviteHistoryService } from './telegram-invite-history.service';
import { TelegramInvitePersistenceService } from './telegram-invite-persistence.service';
import { TelegramInviteSnapshotStore } from './telegram-invite-snapshot.store';
import { TelegramInviteSyncService } from './telegram-invite-sync.service';
import { TelegramManagedPostBulkService } from './telegram-managed-post-bulk.service';
import { TelegramManagedPostCommandService } from './telegram-managed-post-command.service';
import { TelegramManagedPostEditTransportService } from './telegram-managed-post-edit-transport.service';
import { TelegramManagedPostGroupPresentationService } from './telegram-managed-post-group-presentation.service';
import { TelegramManagedPostHistoryService } from './telegram-managed-post-history.service';
import { TelegramManagedPostMoveService } from './telegram-managed-post-move.service';
import { TelegramManagedPostPresentationService } from './telegram-managed-post-presentation.service';
import { TelegramManagedPostPublicationService } from './telegram-managed-post-publication.service';
import { TelegramManagedPostPublisherService } from './telegram-managed-post-publisher.service';
import { TelegramManagedPostQueryService } from './telegram-managed-post-query.service';
import { TelegramManagedPostReconciliationService } from './telegram-managed-post-reconciliation.service';
import { TelegramManagedPostRemoteSyncService } from './telegram-managed-post-remote-sync.service';
import { TelegramManagedPostRemoteLoaderService } from './telegram-managed-post-remote-loader.service';
import { TelegramManagedPostAutoRepairService } from './telegram-managed-post-auto-repair.service';
import { TelegramManagedPostRevisionStore } from './telegram-managed-post-revision.store';
import { TelegramPostGroupsService } from './telegram-post-groups.service';
import { TelegramPostGroupStore } from './telegram-post-group.store';
import { TelegramPostMetricsService } from './telegram-post-metrics.service';
import { TelegramRemoteScheduledPostImportService } from './telegram-remote-scheduled-post-import.service';
import { TelegramPostMediaBackfillService } from './telegram-post-media-backfill.service';
import { TelegramManagedPostMediaStorageService } from './telegram-managed-post-media-storage.service';
import { TelegramSystemPostGroupsService } from './telegram-system-post-groups.service';
import { TelegramManagedPostRecoveryController } from './telegram-managed-post-recovery.controller';
import { TelegramManagedPostScheduledResetService } from './telegram-managed-post-scheduled-reset.service';

@Module({
  imports: [AdCampaignsModule],
  controllers: [
    TelegramChannelsController,
    TelegramManagedPostRecoveryController,
  ],
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
    TelegramChannelsSupportService,
    TelegramChannelAdmissionSyncService,
    TelegramChannelAccessService,
    TelegramChannelSchemaCompatibilityService,
    TelegramChannelImportPolicyService,
    TelegramInviteAttributionService,
    TelegramInviteSnapshotStore,
    TelegramInvitePersistenceService,
    TelegramInviteHistoryService,
    TelegramInviteSyncService,
    TelegramManagedPostPresentationService,
    TelegramManagedPostRevisionStore,
    TelegramManagedPostEditTransportService,
    TelegramChannelFinancialReadService,
    TelegramChannelBookingReadService,
    TelegramChannelAdPricingReadService,
    TelegramChannelCatalogService,
    TelegramChannelLifecycleService,
    TelegramManagedPostGroupPresentationService,
    TelegramPostGroupsService,
    TelegramPostGroupStore,
    TelegramSystemPostGroupsService,
    TelegramManagedPostQueryService,
    TelegramManagedPostReconciliationService,
    TelegramManagedPostRemoteSyncService,
    TelegramManagedPostRemoteLoaderService,
    TelegramManagedPostAutoRepairService,
    TelegramRemoteScheduledPostImportService,
    TelegramPostMediaBackfillService,
    TelegramManagedPostMediaStorageService,
    TelegramManagedPostCommandService,
    TelegramManagedPostHistoryService,
    TelegramManagedPostScheduledResetService,
    TelegramManagedPostPublicationService,
    TelegramManagedPostPublisherService,
    TelegramManagedPostBulkService,
    TelegramManagedPostMoveService,
    TelegramChannelInsightsService,
    TelegramChannelImportService,
    TelegramChannelImportPreparationService,
    TelegramChannelSyncOrchestrator,
    TelegramChannelSyncResultService,
    TelegramChannelDeepSyncService,
    TelegramChannelHistoricalSyncService,
    TelegramPostMetricsService,
    TelegramChannelWorkbookExportService,
    TelegramChannelWorkbookDataService,
    TelegramChannelWorkbookWriter,
    TelegramChannelWorkbookSheetWriter,
    TelegramBroadcastStatsService,
    TelegramChannelReadModelsService,
    TelegramChannelContentReadService,
    TelegramInviteCampaignService,
    TelegramManagedPostCalendarService,
    TelegramManagedPostDeletionService,
    TelegramManagedPostGroupBulkService,
    TelegramManagedPostLinksService,
    TelegramManagedPostImportService,
    TelegramManagedPostImportParserService,
  ],
  exports: [
    TelegramChannelsService,
    TelegramChannelAnalyticsService,
    TelegramChannelFinancialReadService,
    TelegramPostCalendarPlannerService,
    TelegramManagedPostIdentityService,
    TelegramMtprotoClient,
    TelegramSourceAccessService,
    TelegramChannelGptContextExporter,
    TelegramChannelAccessService,
    TelegramChannelImportPolicyService,
    TelegramInviteAttributionService,
    TelegramManagedPostPublicationService,
    TelegramManagedPostBulkService,
    TelegramManagedPostCommandService,
    TelegramPostGroupsService,
    TelegramSystemPostGroupsService,
    TelegramManagedPostReconciliationService,
    TelegramManagedPostRemoteSyncService,
    TelegramChannelSyncOrchestrator,
    TelegramPostMetricsService,
    TelegramPostMediaBackfillService,
    TelegramManagedPostMediaStorageService,
    TelegramBroadcastStatsService,
  ],
})
export class TelegramChannelsModule {}
