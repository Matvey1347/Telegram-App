import { Module } from '@nestjs/common';
import { TelegramBotApiClient } from '@api/telegram/shared/bot/telegram-bot-api.client';
import { TelegramSourceAccessService } from '@api/telegram/shared/imports/telegram-source-access.service';
import { TelegramBotInteractiveReplyService } from '@api/telegram/shared/bot/telegram-bot-interactive-reply.service';
import { TelegramBotApplicationDispatcherService } from './core/telegram-bot-application-dispatcher.service';
import {
  TELEGRAM_BOT_FINANCE_HANDLER,
  TELEGRAM_BOT_FINANCE_PRESENTATION,
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
import { FinanceBotIconInputService } from '@consumer-finance/bot/finance-bot-icon-input.service';
import { TelegramBotRuntimeAvatarController } from './core/telegram-bot-runtime-avatar.controller';
import { FinanceBotService } from '@consumer-finance/bot/finance-bot.service';
import { FinanceTelegramPresentationService } from '@consumer-finance/bot/finance-telegram-presentation.service';
import { FinanceBotChatResponderService } from '@consumer-finance/bot/finance-bot-chat-responder.service';
import { FinanceChatFlowService } from '@consumer-finance/api/chat-flows/finance-chat-flow.service';
import { FinanceChatFlowPresenterService } from '@consumer-finance/api/chat-flows/finance-chat-flow-presenter.service';
import { FinanceEntitlementService } from '@consumer-finance/api/billing/finance-entitlement.service';
import { BotBillingModule } from '../bot-billing/bot-billing.module';
import { FinanceAiConfigService } from '@consumer-finance/api/ai/finance-ai-config.service';
import { FinanceAiConfigController } from '@consumer-finance/api/ai/finance-ai-config.controller';
import { FinanceController } from '@consumer-finance/api/http/finance.controller';
import { FinanceBrowserContextController } from '@consumer-finance/api/http/finance-browser-context.controller';
import { FinanceLocalDevelopmentController } from '@consumer-finance/api/http/finance-local-development.controller';
import { FinanceBrowserContextService } from '@consumer-finance/api/http/finance-browser-context.service';
import { FinanceLocalDevelopmentService } from '@consumer-finance/api/http/finance-local-development.service';
import { FinanceUltimateController } from '@consumer-finance/api/ultimate/finance-ultimate.controller';
import { FinanceUltimateService } from '@consumer-finance/api/ultimate/finance-ultimate.service';
import { FinanceAssistantEntryService } from '@consumer-finance/api/ultimate/finance-assistant-entry.service';
import { FinanceContextService } from '@consumer-finance/api/identity/finance-context.service';
import { FinanceConsumerSessionService } from '@consumer-finance/api/identity/finance-consumer-session.service';
import { FinanceConsumerRuntimeEnvironmentService } from '@consumer-finance/api/identity/finance-consumer-runtime-environment.service';
import { FinanceConsumerTransferService } from '@consumer-finance/api/identity/finance-consumer-transfer.service';
import { FinanceBotBrowserLogin } from '@consumer-finance/bot/finance-bot-browser-login';
import { FinanceCoreService } from '@consumer-finance/api/catalog/finance-core.service';
import { FinanceLedgerService } from '@consumer-finance/api/ledger/finance-ledger.service';
import { FinanceTransferService } from '@consumer-finance/api/transfers/finance-transfer.service';
import { FinanceProposalService } from '@consumer-finance/api/chat-flows/finance-proposal.service';
import { FinanceAiProviderService } from '@consumer-finance/api/ai/finance-ai.provider';
import { FinanceAiAnalyticsService } from '@consumer-finance/api/ai/finance-ai-analytics.service';
import { FinanceAiCredentialService } from '@consumer-finance/api/ai/finance-ai-credential.service';
import { FinanceReminderDeliveryService } from '@consumer-finance/api/planning/finance-reminder-delivery.service';
import {
  FinanceBotBrandingAdminController,
  FinanceBotBrandingAssetController,
} from '@consumer-finance/api/branding/finance-bot-branding.controller';
import { FinanceBotBrandingService } from '@consumer-finance/api/branding/finance-bot-branding.service';
import { OperationalHistoryRetentionService } from './core/operational-history-retention.service';
import {
  TELEGRAM_BOT_DELIVERY_WRITER,
  TelegramBotDeliveryWriterService,
} from './core/telegram-bot-delivery-writer';
import { FinanceConsumerRequestService } from '@consumer-finance/api/http/finance-consumer-request.service';
import { FinanceDebtController } from '@consumer-finance/api/obligations/debts/finance-debt.controller';
import { FinanceDebtService } from '@consumer-finance/api/obligations/debts/finance-debt.service';
import { FinanceRegularPaymentController } from '@consumer-finance/api/obligations/regular-payments/finance-regular-payment.controller';
import { FinanceRegularPaymentService } from '@consumer-finance/api/obligations/regular-payments/finance-regular-payment.service';
import { FinanceRegularPaymentConfirmationService } from '@consumer-finance/api/obligations/regular-payments/finance-regular-payment-confirmation.service';
import { FinanceRegularPaymentDeliveryService } from '@consumer-finance/api/obligations/regular-payments/finance-regular-payment-delivery.service';
import { FINANCE_OBLIGATION_PRESENTATION } from '@consumer-finance/api/obligations/finance-obligation-presentation.port';
import { FinanceObligationTelegramPresenter } from '@consumer-finance/bot/finance-obligation-telegram.presenter';
import { FinanceRegularPaymentCallbackHandler } from '@consumer-finance/bot/finance-regular-payment-callback.handler';
import { FinanceAnalyticsService } from '@consumer-finance/api/analytics/finance-analytics.service';
import { FinanceBillingService } from '@consumer-finance/api/billing/finance-billing.service';
import { FinanceBillingAdminController } from '@consumer-finance/api/billing/finance-billing-admin.controller';
import { FinanceConsumerBillingController } from '@consumer-finance/api/billing/finance-consumer-billing.controller';
import { FinanceSavingsController } from '@consumer-finance/api/savings/finance-savings.controller';
import { FinanceSavingsService } from '@consumer-finance/api/savings/finance-savings.service';
import { FinanceSavingsReadService } from '@consumer-finance/api/savings/finance-savings-read.service';
import { FinanceInvestmentController } from '@consumer-finance/api/investments/finance-investment.controller';
import { FinanceInvestmentService } from '@consumer-finance/api/investments/finance-investment.service';
import { FinanceInvestmentReadService } from '@consumer-finance/api/investments/finance-investment-read.service';
import { FinanceAssetSummaryService } from '@consumer-finance/api/assets/finance-asset-summary.service';
import { FinanceSavingsAllocationService } from '@consumer-finance/api/savings/finance-savings-allocation.service';
import { FinanceInvestmentValuationService } from '@consumer-finance/api/investments/finance-investment-valuation.service';
import { FinanceInvestmentCashFlowService } from '@consumer-finance/api/investments/finance-investment-cash-flow.service';
import { FinanceSavingsGoalService } from '@consumer-finance/api/savings/finance-savings-goal.service';
import { FinanceImportController } from '@consumer-finance/api/portability/finance-import.controller';
import { FinanceImportService } from '@consumer-finance/api/portability/finance-import.service';
import { FinanceConsumerAuthGuard } from '@consumer-finance/api/portability/finance-consumer-auth.guard';
import { FinanceCustomIconController } from '@consumer-finance/api/catalog/finance-custom-icon.controller';
import { FinanceCustomIconService } from '@consumer-finance/api/catalog/finance-custom-icon.service';
import { ConfiguredBotAnalyticsService } from './core/configured-bot-analytics.service';

@Module({
  imports: [BotBillingModule],
  controllers: [
    TelegramBotsController,
    TelegramBotRuntimeController,
    TelegramBotRuntimeAvatarController,
    FinanceBrowserContextController,
    FinanceLocalDevelopmentController,
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
    ConfiguredBotAnalyticsService,
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
    FinanceBrowserContextService,
    FinanceLocalDevelopmentService,
    FinanceDebtService,
    FinanceRegularPaymentService,
    FinanceRegularPaymentConfirmationService,
    FinanceRegularPaymentDeliveryService,
    FinanceObligationTelegramPresenter,
    FinanceRegularPaymentCallbackHandler,
    FinanceTelegramPresentationService,
    { provide: TELEGRAM_BOT_FINANCE_HANDLER, useExisting: FinanceBotService },
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
    OperationalHistoryRetentionService,
  ],
  exports: [OperationalHistoryRetentionService],
})
export class TelegramBotsModule {}
