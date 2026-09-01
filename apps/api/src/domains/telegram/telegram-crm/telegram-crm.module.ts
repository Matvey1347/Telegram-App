import { Module } from '@nestjs/common';
import { TelegramCrmAccountCapabilitiesService } from './telegram-crm-account-capabilities.service';
import { TelegramCrmAccountController } from './telegram-crm-account.controller';
import { TelegramCrmAccountAccessService } from './telegram-crm-account-access.service';
import { TelegramCrmAutomationPolicyService } from './telegram-crm-automation-policy.service';
import { TelegramCrmContactCommandService } from './telegram-crm-contact-command.service';
import { TelegramCrmContactReadService } from './telegram-crm-contact-read.service';
import { TelegramCrmController } from './telegram-crm.controller';
import { TelegramCrmConversationService } from './telegram-crm-conversation.service';
import { TelegramCrmDealAutomationService } from './telegram-crm-deal-automation.service';
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
import { TelegramCrmAutomationController } from './telegram-crm-automation.controller';
import { TelegramCrmAutomationConversationService } from './telegram-crm-automation-conversation.service';
import { TelegramCrmAutomationOccurrenceService } from './telegram-crm-automation-occurrence.service';
import { TelegramCrmAutomationRunnerService } from './telegram-crm-automation-runner.service';
import { TelegramCrmAutomationStatusService } from './telegram-crm-automation-status.service';
import { TelegramCrmContactAutomationService } from './telegram-crm-contact-automation.service';
import { TelegramCrmAutomationClaimService } from './telegram-crm-automation-claim.service';
import { TelegramCrmAutomationFinalizerService } from './telegram-crm-automation-finalizer.service';
import { TelegramCrmAutomationAuthorizationService } from './telegram-crm-automation-authorization.service';

@Module({
  controllers: [
    TelegramCrmController,
    TelegramCrmAccountController,
    TelegramCrmInboxController,
    TelegramCrmRuntimeController,
    TelegramCrmEventsController,
    TelegramCrmAutomationController,
  ],
  providers: [
    TelegramCrmAccountAccessService,
    TelegramCrmAccountCapabilitiesService,
    TelegramCrmAutomationPolicyService,
    TelegramCrmContactCommandService,
    TelegramCrmContactReadService,
    TelegramCrmConversationService,
    TelegramCrmDealAutomationService,
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
    TelegramCrmAutomationConversationService,
    TelegramCrmAutomationAuthorizationService,
    TelegramCrmAutomationClaimService,
    TelegramCrmAutomationFinalizerService,
    TelegramCrmAutomationOccurrenceService,
    TelegramCrmAutomationRunnerService,
    TelegramCrmAutomationStatusService,
    TelegramCrmContactAutomationService,
  ],
  exports: [
    TelegramCrmAutomationPolicyService,
    TelegramCrmManualMessagePolicyService,
    TelegramCrmManualMessageEligibilityService,
    TelegramCrmMessageStoreService,
    TelegramCrmLegacyAuthorizationService,
    TelegramCrmAutomationOccurrenceService,
    TelegramCrmAutomationRunnerService,
  ],
})
export class TelegramCrmModule {}
