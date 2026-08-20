import { Module } from '@nestjs/common';
import { TelegramBotApiClient } from '../../../telegram/shared/telegram-bot-api.client';
import { TelegramSourceAccessService } from '../../../telegram/shared/telegram-source-access.service';
import {
  TelegramBotApplicationDispatcherService,
  TelegramBotFinanceHandler,
  TelegramBotGreeterHandler,
} from './core/telegram-bot-application-dispatcher.service';
import { TelegramBotApplicationRegistryService } from './core/telegram-bot-application-registry.service';
import { TelegramBotDeliveryService } from './core/telegram-bot-delivery.service';
import { TelegramBotRuntimeController } from './core/telegram-bot-runtime.controller';
import { TelegramBotRuntimeService } from './core/telegram-bot-runtime.service';
import { TelegramBotRuntimeEnvironmentService } from './core/telegram-bot-runtime-environment.service';
import { TelegramBotRuntimeExecutionContext } from './core/telegram-bot-runtime-execution-context';
import { TelegramBotRuntimePresentationService } from './core/telegram-bot-runtime-presentation.service';
import { TelegramBotRuntimeRegistryService } from './core/telegram-bot-runtime-registry.service';
import { TelegramBotRuntimeCheckService } from './core/telegram-bot-runtime-check.service';
import { TelegramBotUsersService } from './core/telegram-bot-users.service';
import { TelegramBotsController } from './core/telegram-bots.controller';
import { TelegramBotsService } from './core/telegram-bots.service';
import { TelegramBotIdentityService } from './core/telegram-bot-identity.service';
import { TelegramBotIntegrationViewService } from './core/telegram-bot-integration-view.service';
import { TelegramBotLoadingFeedbackService } from './core/telegram-bot-loading-feedback.service';
import { GreeterService } from './greeter/greeter.service';
import { GreeterController } from './greeter/greeter.controller';
import { GreeterAutomationService } from './greeter/greeter-automation.service';
import { FinanceBotService } from './finance/finance-bot.service';
import { FinanceBotChatResponderService } from './finance/finance-bot-chat-responder.service';
import { FinanceChatFlowService } from './finance/finance-chat-flow.service';
import { FinanceEntitlementService } from './finance/finance-entitlement.service';
import { BotBillingModule } from '../bot-billing/bot-billing.module';
import { FinanceAiConfigService } from './finance/finance-ai-config.service';
import { FinanceAiConfigController } from './finance/finance-ai-config.controller';
import { FinanceController } from './finance/finance.controller';
import { FinanceContextService } from './finance/finance-context.service';
import { FinanceConsumerSessionService } from './finance/finance-consumer-session.service';
import { FinanceConsumerTransferService } from './finance/finance-consumer-transfer.service';
import { FinanceCoreService } from './finance/finance-core.service';
import { FinanceLedgerService } from './finance/finance-ledger.service';
import { FinanceProposalService } from './finance/finance-proposal.service';
import { FinanceAiProviderService } from './finance/finance-ai.provider';
import { GreeterExpiryService } from './greeter/greeter-expiry.service';
import { OperationalHistoryRetentionService } from './core/operational-history-retention.service';
import { GreeterAdminService } from './greeter/greeter-admin.service';
import { GreeterAnalyticsService } from './greeter/greeter-analytics.service';
import { GreeterBroadcastAudienceService } from './greeter/greeter-broadcast-audience.service';
import { GreeterBroadcastService } from './greeter/greeter-broadcast.service';
import { GreeterConfigurationService } from './greeter/greeter-configuration.service';
import { GreeterTestModeService } from './greeter/greeter-test-mode.service';

@Module({
  imports: [BotBillingModule],
  controllers: [
    TelegramBotsController,
    TelegramBotRuntimeController,
    GreeterController,
    FinanceAiConfigController,
    FinanceController,
  ],
  providers: [
    TelegramBotsService,
    TelegramBotIdentityService,
    TelegramBotIntegrationViewService,
    TelegramBotLoadingFeedbackService,
    TelegramSourceAccessService,
    TelegramBotApiClient,
    TelegramBotApplicationRegistryService,
    TelegramBotRuntimeService,
    TelegramBotRuntimeEnvironmentService,
    TelegramBotRuntimeExecutionContext,
    TelegramBotRuntimePresentationService,
    TelegramBotRuntimeRegistryService,
    TelegramBotRuntimeCheckService,
    TelegramBotUsersService,
    GreeterService,
    GreeterAdminService,
    GreeterConfigurationService,
    GreeterTestModeService,
    GreeterAnalyticsService,
    GreeterAutomationService,
    GreeterBroadcastAudienceService,
    GreeterBroadcastService,
    FinanceBotService,
    FinanceBotChatResponderService,
    FinanceChatFlowService,
    FinanceEntitlementService,
    FinanceAiConfigService,
    FinanceContextService,
    FinanceConsumerSessionService,
    FinanceConsumerTransferService,
    FinanceCoreService,
    FinanceLedgerService,
    FinanceProposalService,
    FinanceAiProviderService,
    TelegramBotGreeterHandler,
    TelegramBotFinanceHandler,
    TelegramBotApplicationDispatcherService,
    TelegramBotDeliveryService,
    GreeterExpiryService,
    OperationalHistoryRetentionService,
  ],
  exports: [
    GreeterExpiryService,
    GreeterAutomationService,
    GreeterBroadcastService,
    OperationalHistoryRetentionService,
  ],
})
export class TelegramBotsModule {}
