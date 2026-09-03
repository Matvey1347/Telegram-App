import { Module } from '@nestjs/common';
import { TelegramCrmAccountCapabilitiesService } from './telegram-crm-account-capabilities.service';
import { TelegramCrmAccountController } from './telegram-crm-account.controller';
import { TelegramCrmAccountAccessService } from './telegram-crm-account-access.service';
import { TelegramCrmContactCommandService } from './telegram-crm-contact-command.service';
import { TelegramCrmContactReadService } from './telegram-crm-contact-read.service';
import { TelegramCrmController } from './telegram-crm.controller';
import { TelegramCrmConversationService } from './telegram-crm-conversation.service';
import { TelegramCrmManualMessagePolicyService } from './telegram-crm-manual-message-policy.service';
import { TelegramCrmManualMessageEligibilityService } from './telegram-crm-manual-message-eligibility.service';
import { TelegramCrmMessageReadService } from './telegram-crm-message-read.service';
import { TelegramCrmMessageStoreService } from './telegram-crm-message-store.service';
import { TelegramCrmPeerService } from './telegram-crm-peer.service';
import { TelegramCrmSettingsService } from './telegram-crm-settings.service';
import { TelegramCrmSyncStateService } from './telegram-crm-sync-state.service';
import { TelegramCrmLegacyAuthorizationService } from './telegram-crm-legacy-authorization.service';
import { TelegramCrmMtprotoAdapter } from '../../../telegram/shared/telegram-crm-mtproto.adapter';
import { TelegramCrmAccountSessionService } from './telegram-crm-account-session.service';
import { TelegramCrmBatchStoreService } from './telegram-crm-batch-store.service';
import { TelegramCrmDialogBatchWriter } from './telegram-crm-dialog-batch-writer.service';
import { TelegramCrmContactMergeService } from './telegram-crm-contact-merge.service';
import { TelegramCrmEventHub } from './telegram-crm-event-hub.service';
import { TelegramCrmEventsController } from './telegram-crm-events.controller';
import { TelegramCrmHistoryService } from './telegram-crm-history.service';
import { TelegramCrmInboxCommandService } from './telegram-crm-inbox-command.service';
import { TelegramCrmInboxController } from './telegram-crm-inbox.controller';
import { TelegramCrmInboxReadService } from './telegram-crm-inbox-read.service';
import { TelegramCrmInitialSyncService } from './telegram-crm-initial-sync.service';
import { TelegramCrmManualSendService } from './telegram-crm-manual-send.service';
import { TelegramCrmMessageBatchWriter } from './telegram-crm-message-batch-writer.service';
import { TelegramCrmReadService } from './telegram-crm-read.service';
import { TelegramCrmRecoveryService } from './telegram-crm-recovery.service';
import { TelegramCrmRuntimeController } from './telegram-crm-runtime.controller';
import { TelegramCrmRuntimeManager } from './telegram-crm-runtime-manager.service';
import { OperationsNotificationsModule } from '../../operations/notifications/operations-notifications.module';
import { TelegramCrmIncomingNotificationProjector } from './telegram-crm-incoming-notification-projector.service';
import { TelegramCrmNotificationRecipientService } from './telegram-crm-notification-recipient.service';
import { TelegramCrmInternalNotificationProjector } from './telegram-crm-internal-notification-projector.service';

@Module({
  imports: [OperationsNotificationsModule],
  controllers: [
    TelegramCrmController,
    TelegramCrmAccountController,
    TelegramCrmInboxController,
    TelegramCrmRuntimeController,
    TelegramCrmEventsController,
  ],
  providers: [
    TelegramCrmAccountAccessService,
    TelegramCrmAccountCapabilitiesService,
    TelegramCrmContactCommandService,
    TelegramCrmContactReadService,
    TelegramCrmConversationService,
    TelegramCrmManualMessagePolicyService,
    TelegramCrmManualMessageEligibilityService,
    TelegramCrmMessageReadService,
    TelegramCrmMessageStoreService,
    TelegramCrmPeerService,
    TelegramCrmSettingsService,
    TelegramCrmSyncStateService,
    TelegramCrmLegacyAuthorizationService,
    TelegramCrmMtprotoAdapter,
    TelegramCrmAccountSessionService,
    TelegramCrmBatchStoreService,
    TelegramCrmDialogBatchWriter,
    TelegramCrmContactMergeService,
    TelegramCrmEventHub,
    TelegramCrmHistoryService,
    TelegramCrmInboxCommandService,
    TelegramCrmInboxReadService,
    TelegramCrmInitialSyncService,
    TelegramCrmManualSendService,
    TelegramCrmMessageBatchWriter,
    TelegramCrmReadService,
    TelegramCrmRecoveryService,
    TelegramCrmRuntimeManager,
    TelegramCrmIncomingNotificationProjector,
    TelegramCrmNotificationRecipientService,
    TelegramCrmInternalNotificationProjector,
  ],
  exports: [
    TelegramCrmManualMessagePolicyService,
    TelegramCrmManualMessageEligibilityService,
    TelegramCrmMessageStoreService,
    TelegramCrmLegacyAuthorizationService,
    TelegramCrmInternalNotificationProjector,
  ],
})
export class TelegramCrmModule {}
