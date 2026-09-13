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
import { TelegramBotRuntimeUserPresentationService } from './core/telegram-bot-runtime-user-presentation.service';
import { TelegramBotRuntimeRefreshService } from './core/telegram-bot-runtime-refresh.service';
import { TelegramBotLocalDevelopmentService } from './core/telegram-bot-local-development.service';
import { TelegramBotUsersService } from './core/telegram-bot-users.service';
import { TelegramBotsController } from './core/telegram-bots.controller';
import { TelegramBotsService } from './core/telegram-bots.service';
import { TelegramBotIdentityService } from './core/telegram-bot-identity.service';
import { TelegramBotIntegrationViewService } from './core/telegram-bot-integration-view.service';
import { TelegramBotLoadingFeedbackService } from './core/telegram-bot-loading-feedback.service';
import { TelegramBotProfileService } from './core/telegram-bot-profile.service';
import { TelegramBotIconCaptureService } from '../../../telegram/shared/telegram-bot-icon-capture.service';
import { FinanceBotIconInputService } from './finance/finance-bot-icon-input.service';
import { TelegramBotRuntimeAvatarController } from './core/telegram-bot-runtime-avatar.controller';
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
import { FinanceAssistantEntryService } from '../consumer-finance/ultimate/finance-assistant-entry.service';
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
import { FinanceAiAnalyticsService } from '../consumer-finance/ai/finance-ai-analytics.service';
import { FinanceAiCredentialService } from '../consumer-finance/ai/finance-ai-credential.service';
import { FinanceReminderDeliveryService } from '../consumer-finance/planning/finance-reminder-delivery.service';
import {
  FinanceBotBrandingAdminController,
  FinanceBotBrandingAssetController,
} from '../consumer-finance/branding/finance-bot-branding.controller';
import { FinanceBotBrandingService } from '../consumer-finance/branding/finance-bot-branding.service';
import { GreeterExpiryService } from './greeter/greeter-expiry.service';
import { OperationalHistoryRetentionService } from './core/operational-history-retention.service';
import { GreeterAdminService } from './greeter/greeter-admin.service';
import { GreeterAnalyticsService } from './greeter/greeter-analytics.service';
import { GreeterBroadcastAudienceService } from './greeter/greeter-broadcast-audience.service';
import { GreeterBroadcastService } from './greeter/greeter-broadcast.service';
import { GreeterConfigurationService } from './greeter/greeter-configuration.service';
import { GreeterTestModeService } from './greeter/greeter-test-mode.service';
import {
  TELEGRAM_BOT_DELIVERY_WRITER,
  TelegramBotDeliveryWriterService,
} from './core/telegram-bot-delivery-writer';
import { FinanceConsumerRequestService } from '../consumer-finance/http/finance-consumer-request.service';
import { FinanceDebtController } from '../consumer-finance/obligations/debts/finance-debt.controller';
import { FinanceDebtService } from '../consumer-finance/obligations/debts/finance-debt.service';
import { FinanceRegularPaymentController } from '../consumer-finance/obligations/regular-payments/finance-regular-payment.controller';
import { FinanceRegularPaymentService } from '../consumer-finance/obligations/regular-payments/finance-regular-payment.service';
import { FinanceRegularPaymentConfirmationService } from '../consumer-finance/obligations/regular-payments/finance-regular-payment-confirmation.service';
import { FinanceRegularPaymentDeliveryService } from '../consumer-finance/obligations/regular-payments/finance-regular-payment-delivery.service';
import { FINANCE_OBLIGATION_PRESENTATION } from '../consumer-finance/obligations/finance-obligation-presentation.port';
import { FinanceObligationTelegramPresenter } from './finance/finance-obligation-telegram.presenter';
import { FinanceRegularPaymentCallbackHandler } from './finance/finance-regular-payment-callback.handler';
import { FinanceAnalyticsService } from '../consumer-finance/analytics/finance-analytics.service';
import { FinanceBillingService } from '../consumer-finance/billing/finance-billing.service';
import { FinanceBillingAdminController } from '../consumer-finance/billing/finance-billing-admin.controller';
import { FinanceConsumerBillingController } from '../consumer-finance/billing/finance-consumer-billing.controller';
import { FinanceSavingsController } from '../consumer-finance/savings/finance-savings.controller';
import { FinanceSavingsService } from '../consumer-finance/savings/finance-savings.service';
import { FinanceSavingsReadService } from '../consumer-finance/savings/finance-savings-read.service';
import { FinanceInvestmentController } from '../consumer-finance/investments/finance-investment.controller';
import { FinanceInvestmentService } from '../consumer-finance/investments/finance-investment.service';
import { FinanceInvestmentReadService } from '../consumer-finance/investments/finance-investment-read.service';
import { FinanceAssetSummaryService } from '../consumer-finance/assets/finance-asset-summary.service';
import { FinanceSavingsAllocationService } from '../consumer-finance/savings/finance-savings-allocation.service';
import { FinanceInvestmentValuationService } from '../consumer-finance/investments/finance-investment-valuation.service';
import { FinanceInvestmentCashFlowService } from '../consumer-finance/investments/finance-investment-cash-flow.service';
import { FinanceSavingsGoalService } from '../consumer-finance/savings/finance-savings-goal.service';
import { FinanceImportController } from '../consumer-finance/portability/finance-import.controller';
import { FinanceImportService } from '../consumer-finance/portability/finance-import.service';
import { FinanceConsumerAuthGuard } from '../consumer-finance/portability/finance-consumer-auth.guard';

@Module({
  imports: [BotBillingModule],
  controllers: [
    TelegramBotsController,
    TelegramBotRuntimeController,
    TelegramBotRuntimeAvatarController,
    GreeterController,
    FinanceAiConfigController,
    FinanceController,
    FinanceDebtController,
    FinanceRegularPaymentController,
    FinanceUltimateController,
    FinanceBillingAdminController,
    FinanceConsumerBillingController,
    FinanceSavingsController,
    FinanceInvestmentController,
    FinanceBotBrandingAdminController,
    FinanceBotBrandingAssetController,
    FinanceImportController,
  ],
  providers: [
    TelegramBotsService,
    TelegramBotIdentityService,
    TelegramBotIntegrationViewService,
    TelegramBotLoadingFeedbackService,
    TelegramBotProfileService,
    TelegramBotIconCaptureService,
    FinanceBotIconInputService,
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
    TelegramBotRuntimeUserPresentationService,
    TelegramBotRuntimeRefreshService,
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
    FinanceAnalyticsService,
    FinanceSavingsService,
    FinanceSavingsReadService,
    FinanceSavingsAllocationService,
    FinanceSavingsGoalService,
    FinanceImportService,
    FinanceConsumerAuthGuard,
    FinanceInvestmentService,
    FinanceInvestmentReadService,
    FinanceInvestmentValuationService,
    FinanceInvestmentCashFlowService,
    FinanceAssetSummaryService,
    FinanceBillingService,
    FinanceTransferService,
    FinanceUltimateService,
    FinanceAssistantEntryService,
    FinanceProposalService,
    FinanceAiProviderService,
    FinanceAiAnalyticsService,
    FinanceAiCredentialService,
    FinanceReminderDeliveryService,
    FinanceBotBrandingService,
    FinanceConsumerRequestService,
    FinanceDebtService,
    FinanceRegularPaymentService,
    FinanceRegularPaymentConfirmationService,
    FinanceRegularPaymentDeliveryService,
    FinanceObligationTelegramPresenter,
    FinanceRegularPaymentCallbackHandler,
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
    TelegramBotDeliveryWriterService,
    {
      provide: TELEGRAM_BOT_DELIVERY_WRITER,
      useExisting: TelegramBotDeliveryWriterService,
    },
    {
      provide: FINANCE_OBLIGATION_PRESENTATION,
      useExisting: FinanceObligationTelegramPresenter,
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
