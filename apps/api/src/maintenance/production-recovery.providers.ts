import { TelegramManagedPostNativeRecoveryStore } from '../domains/telegram/telegram-channels/telegram-managed-post-native-recovery.store';
import { ApplicationLoggerService } from '../domains/operations/application-logs/application-logger.service';
import { ResponseCacheService } from '../common/response-cache.service';
import { WorkspaceService } from '../common/workspace.service';
import { TokenEncryptionService } from '../common/security/token-encryption.service';
import { B2ObjectStorageService } from '../common/object-storage/b2-object-storage.service';
import { CurrencyConversionService } from '../common/currency-conversion.service';
import { HistoricalExchangeRateService } from '../common/historical-exchange-rate.service';
import { JwtStrategy } from '../domains/identity/auth/jwt.strategy';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
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

/** Explicit request-only closure: no domain module or worker bootstrap imports. */
export const productionRecoveryProviders = [
  WorkspaceService,
  ResponseCacheService,
  TokenEncryptionService,
  B2ObjectStorageService,
  CurrencyConversionService,
  HistoricalExchangeRateService,
  JwtStrategy,
  JwtAuthGuard,
  StreamResponseService,
  {
    provide: ApplicationLoggerService,
    // Recovery streams disable persisted lifecycle logs. A console-only sink
    // keeps this development host independent of the logging worker/module.
    useValue: { writeStructured: () => undefined },
  },
  { provide: TelegramMtprotoClient, useClass: ProductionRecoveryMtprotoRelay },
  TelegramBotApiClient,
  TelegramSourceAccessService,
  TelegramSystemBotConfigService,
  TelegramManagedPostReschedulerService,
  TelegramManagedPostRecoverySnapshotService,
  TelegramChannelsSupportService,
  TelegramChannelAccessService,
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
  TelegramManagedPostPremiumEmojiRepairService,
  TelegramChannelSchemaCompatibilityService,
  TelegramPostGroupStore,
  TelegramChannelAnalyticsService,
  TelegramChannelFinancialReadService,
  TelegramChannelAdPricingReadService,
];
