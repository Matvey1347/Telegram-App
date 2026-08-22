import { Module } from '@nestjs/common';
import { TelegramBotApiClient } from '../../../telegram/shared/telegram-bot-api.client';
import { TelegramSourceAccessService } from '../../../telegram/shared/telegram-source-access.service';
import { TelegramBotInteractiveReplyService } from '../../../telegram/shared/telegram-bot-interactive-reply.service';
import { TelegramBotApplicationDispatcherService } from './core/telegram-bot-application-dispatcher.service';
import {
  TELEGRAM_BOT_FINANCE_HANDLER,
  TELEGRAM_BOT_FINANCE_PRESENTATION,
  TELEGRAM_BOT_GREETER_HANDLER,
  TELEGRAM_BOT_GREETER_PRESENTATION,
} from './core/telegram-bot-application.ports';
import { TelegramBotApplicationRegistryService } from './core/telegram-bot-application-registry.service';
import { TelegramBotDeliveryService } from './core/telegram-bot-delivery.service';
import { FINANCE_REMINDER_DELIVERY_PORT } from './core/telegram-bot-delivery.ports';
import { TelegramBotRuntimeController } from './core/telegram-bot-runtime.controller';
import { TelegramBotRuntimeService } from './core/telegram-bot-runtime.service';
import { TelegramBotRuntimeEnvironmentService } from './core/telegram-bot-runtime-environment.service';
import { TelegramBotRuntimeExecutionContext } from './core/telegram-bot-runtime-execution-context';
import { TelegramBotRuntimePresentationService } from './core/telegram-bot-runtime-presentation.service';
import { TelegramBotRuntimeRegistryService } from './core/telegram-bot-runtime-registry.service';
import { TelegramBotRuntimeCheckService } from './core/telegram-bot-runtime-check.service';
import { TelegramBotLocalDevelopmentService } from './core/telegram-bot-local-development.service';
import { TelegramBotUsersService } from './core/telegram-bot-users.service';
import { TelegramBotsController } from './core/telegram-bots.controller';
import { TelegramBotsService } from './core/telegram-bots.service';
import { TelegramBotIdentityService } from './core/telegram-bot-identity.service';
import { TelegramBotIntegrationViewService } from './core/telegram-bot-integration-view.service';
import { TelegramBotLoadingFeedbackService } from './core/telegram-bot-loading-feedback.service';
import { GreeterService } from './greeter/greeter.service';
import { GreeterController } from './greeter/greeter.controller';
import { GreeterAutomationService } from './greeter/greeter-automation.service';
import { GreeterTelegramPresentationService } from './greeter/greeter-telegram-presentation.service';
import { FinanceBotService } from './finance/finance-bot.service';
import { FinanceTelegramPresentationService } from './finance/finance-telegram-presentation.service';
import { FinanceBotChatResponderService } from './finance/finance-bot-chat-responder.service';
import { FinanceChatFlowService } from '../consumer-finance/chat-flows/finance-chat-flow.service';
import { FinanceChatFlowPresenterService } from '../consumer-finance/chat-flows/finance-chat-flow-presenter.service';
import { FinanceEntitlementService } from '../consumer-finance/billing/finance-entitlement.service';
import { BotBillingModule } from '../bot-billing/bot-billing.module';
import { FinanceAiConfigService } from '../consumer-finance/ai/finance-ai-config.service';
import { FinanceAiConfigController } from '../consumer-finance/ai/finance-ai-config.controller';
import { FinanceController } from '../consumer-finance/http/finance.controller';
import { FinanceUltimateController } from '../consumer-finance/ultimate/finance-ultimate.controller';
import { FinanceUltimateService } from '../consumer-finance/ultimate/finance-ultimate.service';
import { FinanceContextService } from '../consumer-finance/identity/finance-context.service';
import { FinanceConsumerSessionService } from '../consumer-finance/identity/finance-consumer-session.service';
import { FinanceConsumerRuntimeEnvironmentService } from '../consumer-finance/identity/finance-consumer-runtime-environment.service';
import { FinanceConsumerTransferService } from '../consumer-finance/identity/finance-consumer-transfer.service';
import { FinanceBotBrowserLogin } from './finance/finance-bot-browser-login';
import { FinanceCoreService } from '../consumer-finance/catalog/finance-core.service';
import { FinanceLedgerService } from '../consumer-finance/ledger/finance-ledger.service';
import { FinanceTransferService } from '../consumer-finance/transfers/finance-transfer.service';
import { FinanceProposalService } from '../consumer-finance/chat-flows/finance-proposal.service';
import { FinanceAiProviderService } from '../consumer-finance/ai/finance-ai.provider';
import { FinanceReminderDeliveryService } from '../consumer-finance/planning/finance-reminder-delivery.service';
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
    FinanceUltimateController,
  ],
  providers: [
    TelegramBotsService,
    TelegramBotIdentityService,
    TelegramBotIntegrationViewService,
    TelegramBotLoadingFeedbackService,
    TelegramSourceAccessService,
    TelegramBotApiClient,
    TelegramBotInteractiveReplyService,
    TelegramBotApplicationRegistryService,
    TelegramBotRuntimeService,
    TelegramBotRuntimeEnvironmentService,
    TelegramBotRuntimeExecutionContext,
    TelegramBotRuntimePresentationService,
    TelegramBotRuntimeRegistryService,
    TelegramBotRuntimeCheckService,
    TelegramBotLocalDevelopmentService,
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
    FinanceChatFlowPresenterService,
    FinanceEntitlementService,
    FinanceAiConfigService,
    FinanceContextService,
    FinanceConsumerSessionService,
    FinanceConsumerRuntimeEnvironmentService,
    FinanceConsumerTransferService,
    FinanceBotBrowserLogin,
    FinanceCoreService,
    FinanceLedgerService,
    FinanceTransferService,
    FinanceUltimateService,
    FinanceProposalService,
    FinanceAiProviderService,
    FinanceReminderDeliveryService,
    GreeterTelegramPresentationService,
    FinanceTelegramPresentationService,
    { provide: TELEGRAM_BOT_GREETER_HANDLER, useExisting: GreeterService },
    { provide: TELEGRAM_BOT_FINANCE_HANDLER, useExisting: FinanceBotService },
    {
      provide: TELEGRAM_BOT_GREETER_PRESENTATION,
      useExisting: GreeterTelegramPresentationService,
    },
    {
      provide: TELEGRAM_BOT_FINANCE_PRESENTATION,
      useExisting: FinanceTelegramPresentationService,
    },
    {
      provide: FINANCE_REMINDER_DELIVERY_PORT,
      useExisting: FinanceReminderDeliveryService,
    },
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
