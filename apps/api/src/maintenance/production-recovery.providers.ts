import { TelegramManagedPostNativeRecoveryStore } from '../domains/telegram/telegram-channels/telegram-managed-post-native-recovery.store';
import { ApplicationLoggerService } from '../domains/operations/application-logs/application-logger.service';
import { ResponseCacheService } from '../common/response-cache.service';
import { WorkspaceService } from '../common/workspace.service';
import { TokenEncryptionService } from '../common/security/token-encryption.service';
import { B2ObjectStorageService } from '../common/object-storage/b2-object-storage.service';
import { CurrencyConversionService } from '../common/currency-conversion.service';
import { HistoricalExchangeRateService } from '../common/historical-exchange-rate.service';
import { ProductionRecoveryAdmission } from './production-recovery-admission';
import {
  RecoveryChannelAccess,
  RecoverySchemaCompatibility,
  unavailableRecoveryCredential,
} from './production-recovery-adapters';
import { StreamResponseService } from '../common/stream/stream-response.service';
import { TelegramMtprotoClient } from '../telegram/shared/mtproto/telegram-mtproto.client';
import { ProductionRecoveryMtprotoRelay } from '../telegram/shared/mtproto/production-recovery-mtproto-relay';
import { TelegramBotApiClient } from '../telegram/shared/bot/telegram-bot-api.client';
import { TelegramSourceAccessService } from '../telegram/shared/imports/telegram-source-access.service';
import { TelegramSystemBotConfigService } from '../domains/telegram/telegram-system-bot/telegram-system-bot-config.service';
import { TelegramManagedPostReschedulerService } from '../domains/telegram/telegram-channels/telegram-managed-post-rescheduler.service';
import { TelegramManagedPostRecoverySnapshotService } from '../domains/telegram/telegram-channels/telegram-managed-post-recovery-snapshot.service';
import { TelegramChannelsSupportService } from '../domains/telegram/telegram-channels/telegram-channels-support.service';
import { TelegramChannelAccessService } from '../domains/telegram/telegram-channels/telegram-channel-access.service';
import { TelegramManagedPostRevisionStore } from '../domains/telegram/telegram-channels/telegram-managed-post-revision.store';
import { TelegramPostGroupsService } from '../domains/telegram/telegram-channels/telegram-post-groups.service';
import { TelegramManagedPostPublicationService } from '../domains/telegram/telegram-channels/telegram-managed-post-publication.service';
import { TelegramManagedPostPublisherService } from '../domains/telegram/telegram-channels/telegram-managed-post-publisher.service';
import { TelegramManagedPostIdentityService } from '../domains/telegram/telegram-channels/telegram-managed-post-identity.service';
import { TelegramManagedPostPresentationService } from '../domains/telegram/telegram-channels/telegram-managed-post-presentation.service';
import { TelegramManagedPostGroupPresentationService } from '../domains/telegram/telegram-channels/telegram-managed-post-group-presentation.service';
import { TelegramManagedPostSendJournalService } from '../domains/telegram/telegram-channels/telegram-managed-post-send-journal.service';
import { TelegramManagedPostMediaStorageService } from '../domains/telegram/telegram-channels/telegram-managed-post-media-storage.service';
import { TelegramManagedPostPremiumEmojiRepairService } from '../domains/telegram/telegram-channels/telegram-managed-post-premium-emoji-repair.service';
import { TelegramChannelSchemaCompatibilityService } from '../domains/telegram/telegram-channels/telegram-channel-schema-compatibility.service';
import { TelegramPostGroupStore } from '../domains/telegram/telegram-channels/telegram-post-group.store';
import { TelegramChannelAnalyticsService } from '../domains/telegram/telegram-channels/telegram-channel-analytics.service';
import { TelegramChannelFinancialReadService } from '../domains/telegram/telegram-channels/telegram-channel-financial-read.service';
import { TelegramChannelAdPricingReadService } from '../domains/telegram/telegram-channels/telegram-channel-ad-pricing-read.service';

import { TelegramManagedPostCommandService } from '../domains/telegram/telegram-channels/telegram-managed-post-command.service';
import { TelegramManagedPostHistoryService } from '../domains/telegram/telegram-channels/telegram-managed-post-history.service';
import { TelegramManagedPostEditTransportService } from '../domains/telegram/telegram-channels/telegram-managed-post-edit-transport.service';
import { TelegramChannelCatalogService } from '../domains/telegram/telegram-channels/telegram-channel-catalog.service';
import { TelegramChannelBookingReadService } from '../domains/telegram/telegram-channels/telegram-channel-booking-read.service';
import { TelegramChannelAudienceTrendReadService } from '../domains/telegram/telegram-channels/telegram-channel-audience-trend-read.service';
import { TelegramChannelTrafficAttributionService } from '../domains/telegram/telegram-channels/telegram-channel-traffic-attribution.service';
import { TelegramChannelTrafficAttributionReadService } from '../domains/telegram/telegram-channels/telegram-channel-traffic-attribution-read.service';

import { ProductionOperatorBotRelay } from '../telegram/shared/mtproto/production-operator-send-relay';
import { ProductionOperatorPublicationService } from './production-operator-publication.service';
import { TelegramManagedPostQueryService } from '../domains/telegram/telegram-channels/telegram-managed-post-query.service';
import { TelegramManagedPostSyntheticReadService } from '../domains/telegram/telegram-channels/telegram-managed-post-synthetic-read.service';
import { TelegramPostGroupSummaryReadService } from '../domains/telegram/telegram-channels/telegram-post-group-summary-read.service';
import { TelegramManagedPostCalendarService } from '../domains/telegram/telegram-channels/telegram-managed-post-calendar.service';

/** Explicit request-only closure: no domain module or worker bootstrap imports. */
export const productionRecoveryProviders = [
  WorkspaceService,
  ResponseCacheService,
  {
    provide: TokenEncryptionService,
    useValue: {
      decrypt: unavailableRecoveryCredential,
      encrypt: unavailableRecoveryCredential,
    },
  },
  B2ObjectStorageService,
  CurrencyConversionService,
  HistoricalExchangeRateService,
  ProductionRecoveryAdmission,
  StreamResponseService,
  {
    provide: ApplicationLoggerService,
    // Recovery streams disable persisted lifecycle logs. A console-only sink
    // keeps this development host independent of the logging worker/module.
    useValue: { writeStructured: () => undefined },
  },
  { provide: TelegramMtprotoClient, useClass: ProductionRecoveryMtprotoRelay },
  { provide: TelegramBotApiClient, useClass: ProductionOperatorBotRelay },
  ProductionOperatorPublicationService,
  TelegramManagedPostQueryService,
  TelegramManagedPostSyntheticReadService,
  TelegramManagedPostCalendarService,
  TelegramPostGroupSummaryReadService,
  TelegramSourceAccessService,
  TelegramSystemBotConfigService,
  TelegramManagedPostReschedulerService,
  TelegramManagedPostRecoverySnapshotService,
  TelegramChannelsSupportService,
  { provide: TelegramChannelAccessService, useClass: RecoveryChannelAccess },
  TelegramManagedPostRevisionStore,
  TelegramPostGroupsService,
  TelegramManagedPostPublicationService,
  TelegramManagedPostPublisherService,
  TelegramManagedPostNativeRecoveryStore,
  TelegramManagedPostIdentityService,
  TelegramManagedPostPresentationService,
  TelegramManagedPostGroupPresentationService,
  TelegramManagedPostSendJournalService,
  TelegramManagedPostMediaStorageService,
  {
    provide: TelegramManagedPostPremiumEmojiRepairService,
    useValue: { restoreCustomEmojiAfterBotDelivery: async () => undefined },
  },
  {
    provide: TelegramChannelSchemaCompatibilityService,
    useClass: RecoverySchemaCompatibility,
  },
  TelegramPostGroupStore,
  TelegramChannelAnalyticsService,
  TelegramChannelFinancialReadService,
  TelegramChannelAdPricingReadService,
  TelegramManagedPostCommandService,
  TelegramManagedPostHistoryService,
  TelegramManagedPostEditTransportService,
  TelegramChannelCatalogService,
  TelegramChannelBookingReadService,
  TelegramChannelAudienceTrendReadService,
  TelegramChannelTrafficAttributionService,
  TelegramChannelTrafficAttributionReadService,
];
