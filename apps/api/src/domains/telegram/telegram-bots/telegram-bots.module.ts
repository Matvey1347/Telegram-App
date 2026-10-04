import { Module } from '@nestjs/common';
import { TelegramBotApiClient } from '@api/telegram/shared/bot/telegram-bot-api.client';
import { TelegramSourceAccessService } from '@api/telegram/shared/imports/telegram-source-access.service';
import { TelegramBotInteractiveReplyService } from '@api/telegram/shared/bot/telegram-bot-interactive-reply.service';
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
import { TelegramBotIconCaptureService } from '@api/telegram/shared/bot/telegram-bot-icon-capture.service';
import { FinanceBotIconInputService } from '@finance-pro/bot/finance-bot-icon-input.service';
import { TelegramBotRuntimeAvatarController } from './core/telegram-bot-runtime-avatar.controller';
import { GreeterService } from '@greeter/api/core/greeter.service';
import { GreeterController } from '@greeter/api/core/greeter.controller';
import { GreeterAutomationService } from '@greeter/api/automation/greeter-automation.service';
import { GreeterTelegramPresentationService } from '@greeter/api/templates/greeter-telegram-presentation.service';
import { FinanceBotService } from '@finance-pro/bot/finance-bot.service';
import { FinanceTelegramPresentationService } from '@finance-pro/bot/finance-telegram-presentation.service';
import { FinanceBotChatResponderService } from '@finance-pro/bot/finance-bot-chat-responder.service';
import { FinanceChatFlowService } from '@finance-pro/api/chat-flows/finance-chat-flow.service';
import { FinanceChatFlowPresenterService } from '@finance-pro/api/chat-flows/finance-chat-flow-presenter.service';
import { FinanceEntitlementService } from '@finance-pro/api/billing/finance-entitlement.service';
import { BotBillingModule } from '../bot-billing/bot-billing.module';
import { FinanceAiConfigService } from '@finance-pro/api/ai/finance-ai-config.service';
import { FinanceAiConfigController } from '@finance-pro/api/ai/finance-ai-config.controller';
import { FinanceController } from '@finance-pro/api/http/finance.controller';
import { FinanceUltimateController } from '@finance-pro/api/ultimate/finance-ultimate.controller';
import { FinanceUltimateService } from '@finance-pro/api/ultimate/finance-ultimate.service';
import { FinanceAssistantEntryService } from '@finance-pro/api/ultimate/finance-assistant-entry.service';
import { FinanceContextService } from '@finance-pro/api/identity/finance-context.service';
import { FinanceConsumerSessionService } from '@finance-pro/api/identity/finance-consumer-session.service';
import { FinanceConsumerRuntimeEnvironmentService } from '@finance-pro/api/identity/finance-consumer-runtime-environment.service';
import { FinanceConsumerTransferService } from '@finance-pro/api/identity/finance-consumer-transfer.service';
import { FinanceBotBrowserLogin } from '@finance-pro/bot/finance-bot-browser-login';
import { FinanceCoreService } from '@finance-pro/api/catalog/finance-core.service';
import { FinanceLedgerService } from '@finance-pro/api/ledger/finance-ledger.service';
import { FinanceTransferService } from '@finance-pro/api/transfers/finance-transfer.service';
import { FinanceProposalService } from '@finance-pro/api/chat-flows/finance-proposal.service';
import { FinanceAiProviderService } from '@finance-pro/api/ai/finance-ai.provider';
import { FinanceAiAnalyticsService } from '@finance-pro/api/ai/finance-ai-analytics.service';
import { FinanceAiCredentialService } from '@finance-pro/api/ai/finance-ai-credential.service';
import { FinanceReminderDeliveryService } from '@finance-pro/api/planning/finance-reminder-delivery.service';
import {
  FinanceBotBrandingAdminController,
  FinanceBotBrandingAssetController,
} from '@finance-pro/api/branding/finance-bot-branding.controller';
import { FinanceBotBrandingService } from '@finance-pro/api/branding/finance-bot-branding.service';
import { GreeterExpiryService } from '@greeter/api/enrollment/greeter-expiry.service';
import { OperationalHistoryRetentionService } from './core/operational-history-retention.service';
import { GreeterAdminService } from '@greeter/api/configuration/greeter-admin.service';
import { GreeterAnalyticsService } from '@greeter/api/analytics/greeter-analytics.service';
import { GreeterBroadcastAudienceService } from '@greeter/api/broadcast/greeter-broadcast-audience.service';
import { GreeterBroadcastService } from '@greeter/api/broadcast/greeter-broadcast.service';
import { GreeterConfigurationService } from '@greeter/api/configuration/greeter-configuration.service';
import { GreeterTestModeService } from '@greeter/api/test-mode/greeter-test-mode.service';
import {
  TELEGRAM_BOT_DELIVERY_WRITER,
  TelegramBotDeliveryWriterService,
} from './core/telegram-bot-delivery-writer';
import { FinanceConsumerRequestService } from '@finance-pro/api/http/finance-consumer-request.service';
import { FinanceDebtController } from '@finance-pro/api/obligations/debts/finance-debt.controller';
import { FinanceDebtService } from '@finance-pro/api/obligations/debts/finance-debt.service';
import { FinanceRegularPaymentController } from '@finance-pro/api/obligations/regular-payments/finance-regular-payment.controller';
import { FinanceRegularPaymentService } from '@finance-pro/api/obligations/regular-payments/finance-regular-payment.service';
import { FinanceRegularPaymentConfirmationService } from '@finance-pro/api/obligations/regular-payments/finance-regular-payment-confirmation.service';
import { FinanceRegularPaymentDeliveryService } from '@finance-pro/api/obligations/regular-payments/finance-regular-payment-delivery.service';
import { FINANCE_OBLIGATION_PRESENTATION } from '@finance-pro/api/obligations/finance-obligation-presentation.port';
import { FinanceObligationTelegramPresenter } from '@finance-pro/bot/finance-obligation-telegram.presenter';
import { FinanceRegularPaymentCallbackHandler } from '@finance-pro/bot/finance-regular-payment-callback.handler';
import { FinanceAnalyticsService } from '@finance-pro/api/analytics/finance-analytics.service';
import { FinanceBillingService } from '@finance-pro/api/billing/finance-billing.service';
import { FinanceBillingAdminController } from '@finance-pro/api/billing/finance-billing-admin.controller';
import { FinanceConsumerBillingController } from '@finance-pro/api/billing/finance-consumer-billing.controller';
import { FinanceSavingsController } from '@finance-pro/api/savings/finance-savings.controller';
import { FinanceSavingsService } from '@finance-pro/api/savings/finance-savings.service';
import { FinanceSavingsReadService } from '@finance-pro/api/savings/finance-savings-read.service';
import { FinanceInvestmentController } from '@finance-pro/api/investments/finance-investment.controller';
import { FinanceInvestmentService } from '@finance-pro/api/investments/finance-investment.service';
import { FinanceInvestmentReadService } from '@finance-pro/api/investments/finance-investment-read.service';
import { FinanceAssetSummaryService } from '@finance-pro/api/assets/finance-asset-summary.service';
import { FinanceSavingsAllocationService } from '@finance-pro/api/savings/finance-savings-allocation.service';
import { FinanceInvestmentValuationService } from '@finance-pro/api/investments/finance-investment-valuation.service';
import { FinanceInvestmentCashFlowService } from '@finance-pro/api/investments/finance-investment-cash-flow.service';
import { FinanceSavingsGoalService } from '@finance-pro/api/savings/finance-savings-goal.service';
import { FinanceImportController } from '@finance-pro/api/portability/finance-import.controller';
import { FinanceImportService } from '@finance-pro/api/portability/finance-import.service';
import { FinanceConsumerAuthGuard } from '@finance-pro/api/portability/finance-consumer-auth.guard';
import { FinanceCustomIconController } from '@finance-pro/api/catalog/finance-custom-icon.controller';
import { FinanceCustomIconService } from '@finance-pro/api/catalog/finance-custom-icon.service';

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
    FinanceCustomIconController,
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
    FinanceCustomIconService,
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
