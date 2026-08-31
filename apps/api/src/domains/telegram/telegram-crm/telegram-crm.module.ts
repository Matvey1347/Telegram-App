import { Module } from '@nestjs/common';
import { TelegramCrmAccountCapabilitiesService } from './telegram-crm-account-capabilities.service';
import { TelegramCrmAccountController } from './telegram-crm-account.controller';
import { TelegramCrmAccountAccessService } from './telegram-crm-account-access.service';
import { TelegramCrmAutomationPolicyService } from './telegram-crm-automation-policy.service';
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

@Module({
  controllers: [TelegramCrmController, TelegramCrmAccountController],
  providers: [
    TelegramCrmAccountAccessService,
    TelegramCrmAccountCapabilitiesService,
    TelegramCrmAutomationPolicyService,
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
  ],
  exports: [
    TelegramCrmAutomationPolicyService,
    TelegramCrmManualMessagePolicyService,
    TelegramCrmManualMessageEligibilityService,
    TelegramCrmMessageStoreService,
    TelegramCrmLegacyAuthorizationService,
  ],
})
export class TelegramCrmModule {}
