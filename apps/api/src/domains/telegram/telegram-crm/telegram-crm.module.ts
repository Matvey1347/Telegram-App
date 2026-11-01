import { TelegramCrmFolderRefreshService } from './telegram-crm-folder-refresh.service';
import { TelegramCrmInboxFoldersService } from './telegram-crm-inbox-folders.service';
import { TelegramCrmStreamAccessService } from './telegram-crm-stream-access.service';
import { TelegramCrmManualSendIntentService } from './telegram-crm-manual-send-intent.service';
import { TelegramCrmChatAccess } from './telegram-crm-chat-access.service';
import { TelegramCrmChatStore } from './telegram-crm-chat-store.service';
import { TelegramCrmChatReceipts } from './telegram-crm-chat-receipts.service';
import { TelegramCrmChatOperations } from './telegram-crm-chat-operations.service';
import { TelegramCrmChatMedia } from './telegram-crm-chat-media.service';
import { TelegramCrmChatTransferGuard } from './telegram-crm-chat-transfer.guard';
import { TelegramCrmChatController } from './telegram-crm-chat.controller';
import { TelegramCrmManualContactsController } from './telegram-crm-manual-contacts.controller';
import { TelegramCrmManualRetentionService } from './telegram-crm-manual-retention.service';
import { TelegramCrmManualFollowUpService } from './telegram-crm-manual-follow-up.service';
import { TelegramCrmManualActivityService } from './telegram-crm-manual-activity.service';
import { TelegramCrmInstagramIdentityService } from './telegram-crm-instagram-identity.service';
import { TelegramCrmManualContactsCommandService } from './telegram-crm-manual-contacts-command.service';
import { TelegramCrmManualContactsReadService } from './telegram-crm-manual-contacts-read.service';
import { TelegramLeadPreparationController } from './lead-discovery/lead-preparation.controller';
import { TelegramLeadPreparationQueueService } from './lead-discovery/lead-preparation-queue.service';
import { TelegramLeadPreparationReadService } from './lead-discovery/lead-preparation-read.service';
import { TelegramLeadCandidateDraftService } from './lead-discovery/lead-candidate-draft.service';
import { TelegramLeadQualificationService } from './lead-discovery/lead-qualification.service';
import { TelegramLeadPreparationContext } from './lead-discovery/lead-preparation-context.service';
import { TelegramLeadTransportEvents } from '@api/telegram/shared/mtproto/telegram-lead-transport-events';
import { TelegramLeadDiscoveryController } from './lead-discovery/lead-discovery.controller';
import { TelegramLeadPolicy } from './lead-discovery/lead-policy.service';
import { TelegramLeadSourceService } from './lead-discovery/lead-source.service';
import { TelegramLeadReadService } from './lead-discovery/lead-read.service';
import { TelegramLeadIngestService } from './lead-discovery/lead-ingest.service';
import { TelegramLeadTransportService } from './lead-discovery/lead-transport.service';
import { TelegramLeadAnalysisService } from './lead-discovery/lead-analysis.service';
import { TelegramLeadCandidateService } from './lead-discovery/lead-candidate.service';
import { TelegramLeadCrmLinker } from './lead-discovery/lead-crm-linker.service';
import { TelegramLeadExportService } from './lead-discovery/lead-export.service';
import { TelegramLeadMonitorService } from './lead-discovery/lead-monitor.service';
import { TelegramLeadRetentionService } from './lead-discovery/lead-retention.service';
import { AiModule } from '../../operations/ai/ai.module';
import { TelegramCrmCopilotController } from './telegram-crm-copilot.controller';
import { TelegramCrmCopilotService } from './telegram-crm-copilot.service';
import { TelegramCrmCopilotContextService } from './telegram-crm-copilot-context.service';
import { TelegramCrmCopilotDraftsService } from './telegram-crm-copilot-drafts.service';
import { TelegramCrmCopilotSendGuard } from './telegram-crm-copilot-send-guard.service';
import { TelegramCrmAiDraftRetentionService } from './telegram-crm-ai-draft-retention.service';
import { TelegramCrmSalesWorkflowService } from './telegram-crm-sales-workflow.service';
import { TelegramCrmSalesWorkflowController } from './telegram-crm-sales-workflow.controller';
import { TelegramCrmInboxFollowUpService } from './telegram-crm-inbox-follow-up.service';
import { TelegramCrmPurchaseContextService } from './telegram-crm-purchase-context.service';
import { TelegramCrmPackageSalesContextService } from './telegram-crm-package-sales-context.service';
import { TelegramAdSalesCrmTasksService } from '../telegram-ad-sales/telegram-ad-sales-crm-tasks.service';
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
import { TelegramCrmMtprotoAdapter } from '@api/telegram/shared/mtproto/telegram-crm-mtproto.adapter';
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
import { TelegramCrmInboxConversationsController } from './telegram-crm-inbox-conversations.controller';
import { TelegramCrmInboxConversationsService } from './telegram-crm-inbox-conversations.service';
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
import { TelegramCrmNotificationEligibilityService } from './telegram-crm-notification-eligibility.service';
import { TelegramCrmNotificationDeliveryPolicy } from './telegram-crm-notification-delivery-policy.service';
import { TelegramCrmFollowUpDeliveryPolicy } from './telegram-crm-follow-up-delivery-policy.service';
import { TelegramCrmNotificationGroups } from './telegram-crm-notification-groups';
import { TelegramCrmInternalNotificationProjector } from './telegram-crm-internal-notification-projector.service';
import { TelegramCrmConversationAttachService } from './telegram-crm-conversation-attach.service';
import { TelegramCrmSystemTagsService } from './telegram-crm-system-tags.service';
import { TelegramCrmPurchaseFolderSyncService } from './telegram-crm-purchase-folder-sync.service';
import { TelegramCrmContactExportService } from './telegram-crm-contact-export.service';
import { ScheduledTaskLockService } from '../../operations/scheduled-tasks/scheduled-task-lock.service';
import { TelegramCrmRuntimeLeaseService } from './telegram-crm-runtime-lease.service';

@Module({
  imports: [OperationsNotificationsModule, AiModule],
  controllers: [
    TelegramCrmChatController,
    TelegramCrmManualContactsController,
    TelegramLeadPreparationController,
    TelegramLeadDiscoveryController,
    TelegramCrmCopilotController,
    TelegramCrmSalesWorkflowController,
    TelegramCrmController,
    TelegramCrmAccountController,
    TelegramCrmInboxController,
    TelegramCrmInboxConversationsController,
    TelegramCrmRuntimeController,
    TelegramCrmEventsController,
  ],
  providers: [
    TelegramCrmStreamAccessService,
    TelegramCrmManualSendIntentService,
    TelegramCrmChatAccess,
    TelegramCrmChatStore,
    TelegramCrmChatReceipts,
    TelegramCrmChatOperations,
    TelegramCrmChatMedia,
    TelegramCrmChatTransferGuard,
    TelegramCrmManualContactsReadService,
    TelegramCrmManualContactsCommandService,
    TelegramCrmInstagramIdentityService,
    TelegramCrmManualActivityService,
    TelegramCrmManualFollowUpService,
    TelegramCrmManualRetentionService,

    TelegramLeadPreparationContext,
    TelegramLeadQualificationService,
    TelegramLeadCandidateDraftService,
    TelegramLeadPreparationReadService,
    TelegramLeadPreparationQueueService,

    TelegramLeadTransportEvents,
    TelegramLeadPolicy,
    TelegramLeadSourceService,
    TelegramLeadReadService,
    TelegramLeadIngestService,
    TelegramLeadTransportService,
    TelegramLeadAnalysisService,
    TelegramLeadCandidateService,
    TelegramLeadCrmLinker,
    TelegramLeadExportService,
    TelegramLeadMonitorService,
    TelegramLeadRetentionService,

    TelegramCrmCopilotService,
    TelegramCrmCopilotContextService,
    TelegramCrmCopilotDraftsService,
    TelegramCrmCopilotSendGuard,
    TelegramCrmAiDraftRetentionService,
    TelegramCrmSalesWorkflowService,
    TelegramCrmInboxFollowUpService,
    TelegramCrmPurchaseContextService,
    TelegramCrmPackageSalesContextService,
    TelegramAdSalesCrmTasksService,
    TelegramCrmAccountAccessService,
    TelegramCrmAccountCapabilitiesService,
    TelegramCrmContactCommandService,
    TelegramCrmContactReadService,
    TelegramCrmContactExportService,
    TelegramCrmConversationService,
    TelegramCrmConversationAttachService,
    TelegramCrmSystemTagsService,
    TelegramCrmPurchaseFolderSyncService,
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
    TelegramCrmInboxConversationsService,
    TelegramCrmInboxFoldersService,
    TelegramCrmFolderRefreshService,
    TelegramCrmInitialSyncService,
    TelegramCrmManualSendService,
    TelegramCrmMessageBatchWriter,
    TelegramCrmReadService,
    TelegramCrmRecoveryService,
    TelegramCrmRuntimeManager,
    TelegramCrmIncomingNotificationProjector,
    TelegramCrmNotificationRecipientService,
    TelegramCrmNotificationEligibilityService,
    TelegramCrmNotificationDeliveryPolicy,
    TelegramCrmFollowUpDeliveryPolicy,
    TelegramCrmNotificationGroups,
    TelegramCrmInternalNotificationProjector,
    // Shared persistent lease; only one API instance may retain CRM's live
    // MTProto transports for a database at a time.
    ScheduledTaskLockService,
    TelegramCrmRuntimeLeaseService,
  ],
  exports: [
    TelegramCrmManualRetentionService,
    TelegramLeadRetentionService,
    TelegramCrmAiDraftRetentionService,
    TelegramAdSalesCrmTasksService,
    TelegramCrmManualMessagePolicyService,
    TelegramCrmManualMessageEligibilityService,
    TelegramCrmMessageStoreService,
    TelegramCrmLegacyAuthorizationService,
    TelegramCrmInternalNotificationProjector,
    TelegramCrmPurchaseFolderSyncService,
  ],
})
export class TelegramCrmModule {}
