import { CurrencyConversionService } from '../../../../common/currency-conversion.service';
import { B2ObjectStorageService } from '../../../../common/object-storage/b2-object-storage.service';
import { ResponseCacheService } from '../../../../common/response-cache.service';
import { TokenEncryptionService } from '../../../../common/security/token-encryption.service';
import { WorkspaceService } from '../../../../common/workspace.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TelegramBotApiClient } from '../../../../telegram/shared/telegram-bot-api.client';
import { TelegramMtprotoClient } from '../../../../telegram/shared/telegram-mtproto.client';
import { TelegramSourceAccessService } from '../../../../telegram/shared/telegram-source-access.service';
import { AdCampaignAdmissionAnalyticsService } from '../../../growth/ad-campaigns/ad-campaign-admission-analytics.service';
import { AdCampaignAdmissionBackfillService } from '../../../growth/ad-campaigns/ad-campaign-admission-backfill.service';
import { ApplicationLoggerService } from '../../../operations/application-logs/application-logger.service';
import { TelegramSystemBotConfigService } from '../../telegram-system-bot/telegram-system-bot-config.service';
import { TelegramBroadcastStatsService } from '../telegram-broadcast-stats.service';
import { TelegramChannelAdmissionSyncService } from '../telegram-channel-admission-sync.service';
import { TelegramChannelAccessService } from '../telegram-channel-access.service';
import { TelegramChannelAnalyticsService } from '../telegram-channel-analytics.service';
import { TelegramChannelBookingReadService } from '../telegram-channel-booking-read.service';
import { TelegramChannelCatalogService } from '../telegram-channel-catalog.service';
import { TelegramChannelContentReadService } from '../telegram-channel-content-read.service';
import { TelegramChannelDeepSyncService } from '../telegram-channel-deep-sync.service';
import { TelegramChannelAdPricingReadService } from '../telegram-channel-ad-pricing-read.service';
import { TelegramChannelFinancialReadService } from '../telegram-channel-financial-read.service';
import { TelegramChannelHistoricalSyncService } from '../telegram-channel-historical-sync.service';
import { TelegramChannelImportPolicyService } from '../telegram-channel-import-policy.service';
import { TelegramChannelImportService } from '../telegram-channel-import.service';
import { TelegramChannelImportPreparationService } from '../telegram-channel-import-preparation.service';
import { TelegramChannelInsightsService } from '../telegram-channel-insights.service';
import { TelegramChannelLifecycleService } from '../telegram-channel-lifecycle.service';
import { TelegramChannelReadModelsService } from '../telegram-channel-read-models.service';
import { TelegramChannelSchemaCompatibilityService } from '../telegram-channel-schema-compatibility.service';
import { TelegramChannelSyncOrchestrator } from '../telegram-channel-sync.orchestrator';
import { TelegramChannelSyncResultService } from '../telegram-channel-sync-result.service';
import { TelegramChannelWorkbookExportService } from '../telegram-channel-workbook-export.service';
import { TelegramChannelWorkbookDataService } from '../telegram-channel-workbook-data.service';
import { TelegramChannelWorkbookWriter } from '../telegram-channel-workbook.writer';
import { TelegramChannelWorkbookSheetWriter } from '../telegram-channel-workbook-sheet.writer';
import { TelegramChannelsSupportService } from '../telegram-channels-support.service';
import { TelegramChannelsService } from '../telegram-channels.service';
import { TelegramInviteAttributionService } from '../telegram-invite-attribution.service';
import { TelegramInviteCampaignService } from '../telegram-invite-campaign.service';
import { TelegramInviteHistoryService } from '../telegram-invite-history.service';
import { TelegramInvitePersistenceService } from '../telegram-invite-persistence.service';
import { TelegramInviteSnapshotStore } from '../telegram-invite-snapshot.store';
import { TelegramInviteSyncService } from '../telegram-invite-sync.service';
import { TelegramManagedPostBulkService } from '../telegram-managed-post-bulk.service';
import { TelegramManagedPostCalendarService } from '../telegram-managed-post-calendar.service';
import { TelegramManagedPostCommandService } from '../telegram-managed-post-command.service';
import { TelegramManagedPostEditTransportService } from '../telegram-managed-post-edit-transport.service';
import { TelegramManagedPostDeletionService } from '../telegram-managed-post-deletion.service';
import { TelegramManagedPostGroupBulkService } from '../telegram-managed-post-group-bulk.service';
import { TelegramManagedPostGroupPresentationService } from '../telegram-managed-post-group-presentation.service';
import { TelegramManagedPostHistoryService } from '../telegram-managed-post-history.service';
import { TelegramManagedPostLinksService } from '../telegram-managed-post-links.service';
import { TelegramManagedPostMediaStorageService } from '../telegram-managed-post-media-storage.service';
import { TelegramManagedPostImportService } from '../telegram-managed-post-import.service';
import { TelegramManagedPostImportParserService } from '../telegram-managed-post-import-parser.service';
import { TelegramManagedPostIdentityService } from '../telegram-managed-post-identity.service';
import { TelegramManagedPostMoveService } from '../telegram-managed-post-move.service';
import { TelegramManagedPostPresentationService } from '../telegram-managed-post-presentation.service';
import { TelegramManagedPostPublicationService } from '../telegram-managed-post-publication.service';
import { TelegramManagedPostPublisherService } from '../telegram-managed-post-publisher.service';
import { TelegramManagedPostQueryService } from '../telegram-managed-post-query.service';
import { TelegramManagedPostSyntheticReadService } from '../telegram-managed-post-synthetic-read.service';
import { TelegramManagedPostReconciliationService } from '../telegram-managed-post-reconciliation.service';
import { TelegramManagedPostRemoteSyncService } from '../telegram-managed-post-remote-sync.service';
import { TelegramManagedPostRemoteLoaderService } from '../telegram-managed-post-remote-loader.service';
import { TelegramManagedPostRevisionStore } from '../telegram-managed-post-revision.store';
import { TelegramPostGroupsService } from '../telegram-post-groups.service';
import { TelegramPostGroupStore } from '../telegram-post-group.store';
import { TelegramPostMetricsService } from '../telegram-post-metrics.service';
import { TelegramRemoteScheduledPostImportService } from '../telegram-remote-scheduled-post-import.service';

type ProviderType = new (...args: any[]) => object;

const narrowProviders: ProviderType[] = [
  TelegramChannelsSupportService,
  TelegramChannelAdmissionSyncService,
  TelegramChannelAccessService,
  TelegramChannelSchemaCompatibilityService,
  TelegramChannelImportPolicyService,
  TelegramInviteAttributionService,
  TelegramInviteSnapshotStore,
  TelegramManagedPostGroupPresentationService,
  TelegramInvitePersistenceService,
  TelegramInviteHistoryService,
  TelegramChannelAdPricingReadService,
  TelegramChannelFinancialReadService,
  TelegramChannelBookingReadService,
  TelegramChannelCatalogService,
  TelegramChannelReadModelsService,
  TelegramInviteSyncService,
  TelegramManagedPostPresentationService,
  TelegramManagedPostRevisionStore,
  TelegramManagedPostEditTransportService,
  TelegramChannelLifecycleService,
  TelegramPostGroupsService,
  TelegramPostGroupStore,
  TelegramManagedPostPublicationService,
  TelegramManagedPostPublisherService,
  TelegramManagedPostReconciliationService,
  TelegramRemoteScheduledPostImportService,
  TelegramManagedPostRemoteSyncService,
  TelegramManagedPostRemoteLoaderService,
  TelegramManagedPostSyntheticReadService,
  TelegramManagedPostQueryService,
  TelegramManagedPostCommandService,
  TelegramManagedPostHistoryService,
  TelegramManagedPostBulkService,
  TelegramManagedPostGroupBulkService,
  TelegramManagedPostDeletionService,
  TelegramManagedPostCalendarService,
  TelegramManagedPostLinksService,
  TelegramManagedPostImportParserService,
  TelegramManagedPostImportService,
  TelegramManagedPostMoveService,
  TelegramChannelHistoricalSyncService,
  TelegramPostMetricsService,
  TelegramBroadcastStatsService,
  TelegramChannelInsightsService,
  TelegramChannelImportService,
  TelegramChannelImportPreparationService,
  TelegramChannelSyncOrchestrator,
  TelegramChannelSyncResultService,
  TelegramChannelDeepSyncService,
  TelegramChannelWorkbookExportService,
  TelegramChannelWorkbookDataService,
  TelegramChannelWorkbookWriter,
  TelegramChannelWorkbookSheetWriter,
  TelegramChannelContentReadService,
  TelegramInviteCampaignService,
];

export type TelegramChannelsTestHarness = TelegramChannelsService &
  Record<string, any>;

export function createTelegramChannelsTestHarness(
  prisma: PrismaService,
  workspaceService: WorkspaceService,
  responseCache: ResponseCacheService,
  encryptionService: TokenEncryptionService,
  mtprotoClient: TelegramMtprotoClient,
  sourceAccessService: TelegramSourceAccessService,
  analyticsService: TelegramChannelAnalyticsService,
  applicationLogger: ApplicationLoggerService = {
    info: () => undefined,
    writeStructured: () => undefined,
  } as unknown as ApplicationLoggerService,
  admissionAnalyticsService?: AdCampaignAdmissionAnalyticsService,
  admissionBackfillService?: AdCampaignAdmissionBackfillService,
  identityService: TelegramManagedPostIdentityService = new TelegramManagedPostIdentityService(
    prisma,
  ),
  botApiClient: TelegramBotApiClient = new TelegramBotApiClient(),
  systemBotConfig?: TelegramSystemBotConfigService,
  currencyConversionService?: CurrencyConversionService,
  objectStorage: B2ObjectStorageService = {
    persistImmutableImages: async () => ({
      urls: [],
      uploaded: 0,
      reused: 0,
    }),
  } as unknown as B2ObjectStorageService,
  mediaStorage: TelegramManagedPostMediaStorageService = {
    persistImageUrls: (imageUrls: string[]) => Promise.resolve(imageUrls),
  } as TelegramManagedPostMediaStorageService,
): TelegramChannelsTestHarness {
  const instances = new Map<unknown, unknown>([
    [PrismaService, prisma],
    [WorkspaceService, workspaceService],
    [ResponseCacheService, responseCache],
    [TokenEncryptionService, encryptionService],
    [TelegramMtprotoClient, mtprotoClient],
    [TelegramSourceAccessService, sourceAccessService],
    [TelegramChannelAnalyticsService, analyticsService],
    [ApplicationLoggerService, applicationLogger],
    [AdCampaignAdmissionAnalyticsService, admissionAnalyticsService],
    [AdCampaignAdmissionBackfillService, admissionBackfillService],
    [TelegramManagedPostIdentityService, identityService],
    [TelegramBotApiClient, botApiClient],
    [TelegramSystemBotConfigService, systemBotConfig],
    [CurrencyConversionService, currencyConversionService],
    [B2ObjectStorageService, objectStorage],
    [TelegramManagedPostMediaStorageService, mediaStorage],
  ]);

  const pending = [...narrowProviders];
  while (pending.length) {
    const before = pending.length;
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      const provider = pending[index];
      const dependencies = (Reflect.getMetadata(
        'design:paramtypes',
        provider,
      ) || []) as unknown[];
      if (!dependencies.every((dependency) => instances.has(dependency))) {
        continue;
      }
      instances.set(
        provider,
        new provider(
          ...dependencies.map((dependency) => instances.get(dependency)),
        ),
      );
      pending.splice(index, 1);
    }
    if (pending.length === before) {
      throw new Error(
        `Could not build Telegram channel test providers: ${pending.map((provider) => provider.name).join(', ')}`,
      );
    }
  }

  const facadeDependencies = (Reflect.getMetadata(
    'design:paramtypes',
    TelegramChannelsService,
  ) || []) as unknown[];
  const Facade = TelegramChannelsService as unknown as new (
    ...args: any[]
  ) => TelegramChannelsService;
  const facade = new Facade(
    ...facadeDependencies.map((dependency) => instances.get(dependency)),
  );
  const targets = [...instances.values()].filter(
    (instance): instance is object => Boolean(instance),
  );

  return new Proxy(facade as TelegramChannelsTestHarness, {
    get(target, property, receiver) {
      if (Reflect.has(target, property))
        return Reflect.get(target, property, receiver);
      const owner = targets.find((candidate) => property in candidate);
      const value = owner && Reflect.get(owner, property);
      return typeof value === 'function' ? value.bind(owner) : value;
    },
    set(target, property, value, receiver) {
      for (const candidate of targets) {
        if (property in candidate) Reflect.set(candidate, property, value);
      }
      return Reflect.set(target, property, value, receiver);
    },
    defineProperty(target, property, attributes) {
      for (const candidate of targets) {
        if (property in candidate) {
          Reflect.defineProperty(candidate, property, attributes);
        }
      }
      return Reflect.defineProperty(target, property, attributes);
    },
  });
}
