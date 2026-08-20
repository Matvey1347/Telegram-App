import { Injectable } from '@nestjs/common';
import { TelegramBotUsersService } from '../core/telegram-bot-users.service';
import { TelegramBotDeliveryService } from '../core/telegram-bot-delivery.service';
import { FinanceContextService } from './finance-context.service';
import { FinanceProposalService } from './finance-proposal.service';
import { FinanceAiProviderService } from './finance-ai.provider';
import { FinanceEntitlementService } from './finance-entitlement.service';
import { TelegramBotApiClient } from '../../../../telegram/shared/telegram-bot-api.client';
import { TokenEncryptionService } from '../../../../common/security/token-encryption.service';
import { BotBillingService } from '../../bot-billing/bot-billing.service';
import type { TelegramBotApplicationContext } from '../core/telegram-bot-update.types';
import {
  financeCategoryEmoji,
  FinanceBotChatResponderService,
  financeMiniAppUrl,
} from './finance-bot-chat-responder.service';
import {
  acknowledgeFinanceCallback,
  sendFinanceTyping,
} from './finance-bot-telegram-interactions';
import { financeChatLocale, t } from './i18n/finance-chat-i18n';
import { FinanceChatFlowService, type AccountFlowResult } from './finance-chat-flow.service';

/** Deterministic chat input parser: `+300 Salary` is income, `250 Store` is expense. */
export function parseFinanceQuickInput(input: string) {
  const match = input.trim().match(/^(\+)?\s*(\d+(?:[.,]\d{1,2})?)\s*(.*)$/u);
  if (!match) return null;
  return {
    type: match[1] ? ('INCOME' as const) : ('EXPENSE' as const),
    amount: match[2].replace(',', '.'),
    description: match[3].trim() || null,
  };
}

export type FinanceChatCommand =
  | 'start'
  | 'income'
  | 'expense'
  | 'recent'
  | 'accounts'
  | 'categories'
  | 'transfer'
  | 'help';

/** Parses Telegram commands, including `/start payload` and `/start@bot`. */
export function parseFinanceChatCommand(input: string): FinanceChatCommand | null {
  const match = input.trim().match(/^\/(start|income|expense|recent|accounts|categories|transfer|help)(?:@[^\s]+)?(?:\s+.*)?$/iu);
  return match ? (match[1].toLowerCase() as FinanceChatCommand) : null;
}

@Injectable()
export class FinanceBotService {
  constructor(
    private readonly users: TelegramBotUsersService,
    private readonly contexts: FinanceContextService,
    private readonly proposals: FinanceProposalService,
    private readonly delivery: TelegramBotDeliveryService,
    private readonly ai: FinanceAiProviderService,
    private readonly entitlements: FinanceEntitlementService,
    private readonly botApi: TelegramBotApiClient,
    private readonly encryption: TokenEncryptionService,
    private readonly billing: BotBillingService,
    private readonly chat: FinanceBotChatResponderService,
    private readonly flows: FinanceChatFlowService,
  ) {}

  async handle(context: TelegramBotApplicationContext) {
    const user = await this.users.upsertFromUpdate({
      workspaceId: context.bot.workspaceId,
      botIntegrationId: context.bot.id,
      update: context.update,
    });
    if (!user) return;
    const profile = await this.contexts.ensureProfile(context.bot.id, user.id);
    const locale = financeChatLocale(profile.locale, user.languageCode);
    const preCheckout = context.update.pre_checkout_query;
    if (preCheckout?.id) {
      const valid = await this.billing.validateStarsPreCheckout({
        botIntegrationId: context.bot.id,
        telegramBotUserId: user.id,
        payload: preCheckout.invoice_payload,
        currency: preCheckout.currency,
        totalAmount: preCheckout.total_amount,
      });
      await this.botApi.answerPreCheckoutQuery(context.token, {
        pre_checkout_query_id: preCheckout.id,
        ok: valid,
        ...(valid
          ? {}
          : {
              error_message: t(locale, 'paymentInvalid'),
            }),
      });
      return;
    }
    const chatId = user.telegramChatId;
    if (!chatId) return;
    const successfulPayment = context.update.message?.successful_payment;
    if (successfulPayment) {
      await this.billing.processStarsPayment({
        botIntegrationId: context.bot.id,
        telegramBotUserId: user.id,
        payment: successfulPayment,
      });
      await this.delivery.enqueueSendMessage({
        workspaceId: context.bot.workspaceId,
        botIntegrationId: context.bot.id,
        telegramBotUserId: user.id,
        chatId,
        text: t(locale, 'proActive'),
        idempotencyKey: `finance-stars-success:${successfulPayment.telegram_payment_charge_id}`,
      });
      return;
    }
    const callback = context.update.callback_query;
    if (callback?.data === 'fin:account:add') {
      await acknowledgeFinanceCallback(this.botApi, this.token(context), callback.id || '', '');
      await this.flows.startAccount(profile.id, context.bot.id, user.id);
      await this.sendAccountFlow(context, user.id, chatId, locale, { kind: 'name' });
      return;
    }
    if (callback?.data?.startsWith('fin:')) {
      const [, action, token] = callback.data.split(':');
      if (!token || !['save', 'cancel'].includes(action)) {
        await acknowledgeFinanceCallback(
          this.botApi,
          this.token(context),
          callback.id || '',
          t(locale, 'unavailable'),
        );
        return;
      }
      await acknowledgeFinanceCallback(
        this.botApi,
        this.token(context),
        callback.id || '',
        action === 'save' ? t(locale, 'saving') : t(locale, 'cancelling'),
      );
      try {
        if (action === 'save') {
          const saved = await this.proposals.confirm({
            token,
            botIntegrationId: context.bot.id,
            telegramBotUserId: user.id,
            profile,
          });
          await this.delivery.enqueueSendMessage({
            workspaceId: context.bot.workspaceId,
            botIntegrationId: context.bot.id,
            telegramBotUserId: user.id,
            chatId,
            text: t(locale, 'saved', { count: saved.transactionIds?.length || 1 }),
            idempotencyKey: `finance-proposal-saved:${token}:${saved.transactionId}`,
          });
        } else {
          await this.proposals.cancel({
            token,
            botIntegrationId: context.bot.id,
            telegramBotUserId: user.id,
          });
          await this.delivery.enqueueSendMessage({
            workspaceId: context.bot.workspaceId,
            botIntegrationId: context.bot.id,
            telegramBotUserId: user.id,
            chatId,
            text: t(locale, 'cancelled'),
            idempotencyKey: `finance-proposal-cancelled:${token}`,
          });
        }
      } catch {
        await this.delivery.enqueueSendMessage({
          workspaceId: context.bot.workspaceId,
          botIntegrationId: context.bot.id,
          telegramBotUserId: user.id,
          chatId,
          text: t(locale, 'proposalExpired'),
          idempotencyKey: `finance-proposal-error:${action}:${token}`,
        });
      }
      return;
    }
    const message = context.update.message;
    const file = message?.document?.file_id
      ? {
          id: message.document.file_id,
          size: message.document.file_size,
          mime: message.document.mime_type,
        }
      : message?.photo?.length
        ? {
            id: message.photo.at(-1)?.file_id,
            size: message.photo.at(-1)?.file_size,
            mime: 'image/jpeg',
          }
        : null;
    if (file?.id) {
      const entitled = await this.entitlements.has(
        { botIntegrationId: context.bot.id, telegramBotUserId: user.id },
        'RECEIPT_SCAN',
      );
      if (!entitled) {
        await this.delivery.enqueueSendMessage({
          workspaceId: context.bot.workspaceId,
          botIntegrationId: context.bot.id,
          telegramBotUserId: user.id,
          chatId,
          text: t(locale, 'receiptGate'),
          inlineButtons: this.proButtons(context.bot.id, locale),
          idempotencyKey: `finance-receipt-gate:${context.updateLogId}`,
        });
        return;
      }
      if (file.size && file.size > 8 * 1024 * 1024) {
        await this.chat.sendSafe(
          context,
          user.id,
          chatId,
          t(locale, 'receiptLarge'),
          `finance-receipt-too-large:${context.updateLogId}`,
        );
        return;
      }
      await sendFinanceTyping(this.botApi, this.token(context), chatId);
      try {
        const token = this.token(context);
        const telegramFile = await this.botApi.getFile(token, file.id);
        if (!telegramFile.file_path) throw new Error('Missing file path');
        const downloaded = await this.botApi.downloadFile(
          token,
          telegramFile.file_path,
          8 * 1024 * 1024,
        );
        const mime = file.mime || downloaded.contentType.split(';')[0];
        const operations = await this.ai.extractReceipt({
          profileId: profile.id,
          botIntegrationId: context.bot.id,
          bytes: downloaded.bytes,
          mime,
          timezone: profile.timezone,
          defaultCurrency: profile.defaultCurrency,
        });
        const proposal = await this.proposals.createBatch({
          profile,
          botIntegrationId: context.bot.id,
          telegramBotUserId: user.id,
          operations,
          source: 'RECEIPT',
        });
        await this.delivery.enqueueSendMessage({
          workspaceId: context.bot.workspaceId,
          botIntegrationId: context.bot.id,
          telegramBotUserId: user.id,
          chatId,
          text: `${t(locale, 'receiptProposal')}\n\n${this.chat.batchPreview(proposal.preview, locale)}\n\n${t(locale, 'review')}`,
          inlineButtons: this.chat.proposalButtons(
            proposal.token,
            t(locale, 'saveReceipt'), locale,
          ),
          idempotencyKey: `finance-receipt-proposal:${context.updateLogId}`,
        });
      } catch {
        await this.chat.sendSafe(
          context,
          user.id,
          chatId,
          t(locale, 'receiptError'),
          `finance-receipt-error:${context.updateLogId}`,
        );
      }
      return;
    }
    const text = message?.text?.trim();
    if (text === '/cancel' || text === t(locale, 'cancelFlow')) {
      const result = await this.flows.cancel(context.bot.id, user.id);
      if (result) await this.sendAccountFlow(context, user.id, chatId, locale, result);
      if (result) return;
    }
    if (text) {
      const flow = await this.flows.consume({ profileId: profile.id, botIntegrationId: context.bot.id, telegramBotUserId: user.id, text });
      if (flow) {
        await this.sendAccountFlow(context, user.id, chatId, locale, flow);
        return;
      }
    }
    const command = text ? parseFinanceChatCommand(text) : null;
    // Commands precede quick-input/AI parsing. Telegram can retain old menus.
    if (command === 'start') {
      await this.chat.sendMainMenu(context, user.id, chatId, locale);
      return;
    }
    if (command === 'income' || text === t(locale, 'menuIncome') || text === 'Add income') {
      await this.delivery.enqueueSendMessage({
        workspaceId: context.bot.workspaceId,
        botIntegrationId: context.bot.id,
        telegramBotUserId: user.id,
        chatId,
        text: t(locale, 'incomeHelp'),
        idempotencyKey: `finance-income-help:${context.updateLogId}`,
      });
      return;
    }
    if (command === 'expense' || text === t(locale, 'menuExpense') || text === 'Add expense') {
      await this.delivery.enqueueSendMessage({
        workspaceId: context.bot.workspaceId,
        botIntegrationId: context.bot.id,
        telegramBotUserId: user.id,
        chatId,
        text: t(locale, 'expenseHelp'),
        idempotencyKey: `finance-expense-help:${context.updateLogId}`,
      });
      return;
    }
    if (text === t(locale, 'menuOpen') || text === 'Open Finance') {
      await this.chat.sendFinanceCta(
        context,
        user.id,
        chatId,
        `finance-open:${context.updateLogId}`, locale,
      );
      return;
    }
    if (command === 'recent' || text === t(locale, 'menuRecent') || text === 'Recent transactions') {
      await this.chat.sendRecentTransactions(
        context,
        user.id,
        profile.id,
        chatId, locale,
      );
      return;
    }
    if (command === 'accounts' || text === t(locale, 'menuAccounts') || text === 'Accounts') {
      await this.chat.sendAccounts(context, user.id, profile.id, chatId, locale);
      return;
    }
    if (command === 'categories' || text === t(locale, 'menuCategories') || text === 'Categories') {
      await this.chat.sendCategories(context, user.id, profile.id, chatId, locale);
      return;
    }
    if (command === 'transfer' || text === t(locale, 'menuTransfer') || text === 'Transfer') {
      await this.chat.sendTransfer(context, user.id, profile.id, chatId, locale);
      return;
    }
    if (command === 'help' || text === t(locale, 'menuHelp') || text === 'Help') {
      await this.delivery.enqueueSendMessage({
        workspaceId: context.bot.workspaceId,
        botIntegrationId: context.bot.id,
        telegramBotUserId: user.id,
        chatId,
          text: t(locale, 'help'),
        idempotencyKey: `finance-help:${context.updateLogId}`,
      });
      return;
    }
    if (!text) return;
    const parsed = parseFinanceQuickInput(text);
    if (!parsed) {
      const entitled = await this.entitlements.has(
        { botIntegrationId: context.bot.id, telegramBotUserId: user.id },
        'AI_INPUT',
      );
      if (!entitled) {
        await this.delivery.enqueueSendMessage({
          workspaceId: context.bot.workspaceId,
          botIntegrationId: context.bot.id,
          telegramBotUserId: user.id,
          chatId,
          text: t(locale, 'aiGate'),
          inlineButtons: this.proButtons(context.bot.id, locale),
          idempotencyKey: `finance-ai-gate:${context.updateLogId}`,
        });
        return;
      }
      await sendFinanceTyping(this.botApi, this.token(context), chatId);
      try {
        const operations = await this.ai.extractText({
          profileId: profile.id,
          botIntegrationId: context.bot.id,
          text,
          timezone: profile.timezone,
          defaultCurrency: profile.defaultCurrency,
        });
        const proposal = await this.proposals.createBatch({
          profile,
          botIntegrationId: context.bot.id,
          telegramBotUserId: user.id,
          operations,
          source: 'AI',
        });
        await this.delivery.enqueueSendMessage({
          workspaceId: context.bot.workspaceId,
          botIntegrationId: context.bot.id,
          telegramBotUserId: user.id,
          chatId,
          text: `${t(locale, 'suggested', { count: proposal.operations.length })}\n\n${this.chat.batchPreview(proposal.preview, locale)}\n\n${t(locale, 'review')}`,
          inlineButtons: this.chat.proposalButtons(proposal.token, t(locale, 'saveAll'), locale),
          idempotencyKey: `finance-ai-proposal:${context.updateLogId}`,
        });
      } catch {
        await this.chat.sendSafe(
          context,
          user.id,
          chatId,
          t(locale, 'aiError'),
          `finance-ai-error:${context.updateLogId}`,
        );
      }
      return;
    }
    const proposal = await this.proposals.createQuick({
      profile,
      botIntegrationId: context.bot.id,
      telegramBotUserId: user.id,
      ...parsed,
    });
    const label = proposal.payload.type === 'EXPENSE' ? `💸 ${t(locale, 'expense')}` : `💰 ${t(locale, 'incomeLabel')}`;
    await this.delivery.enqueueSendMessage({
      workspaceId: context.bot.workspaceId,
      botIntegrationId: context.bot.id,
      telegramBotUserId: user.id,
      chatId,
      text: `${label}\n\n💳 ${t(locale, 'amount')}: ${proposal.payload.amount} ${proposal.payload.currency}\n${financeCategoryEmoji(proposal.category?.name)} ${t(locale, 'category')}: ${proposal.category?.name || t(locale, 'other')}\n🏦 ${t(locale, 'account')}: ${proposal.account.name}\n📝 ${t(locale, 'description')}: ${proposal.payload.description || t(locale, 'notProvided')}\n\n${t(locale, 'review')}`,
      inlineButtons: this.chat.proposalButtons(
        proposal.token,
        t(locale, 'save'), locale,
      ),
      idempotencyKey: `finance-proposal:${context.updateLogId}`,
    });
  }

  private token(context: TelegramBotApplicationContext) {
    return context.token;
  }

  private proButtons(botId: string, locale: ReturnType<typeof financeChatLocale>) {
    const url = financeMiniAppUrl(botId, undefined, 'more');
    return url ? [[{ text: t(locale, 'unlockPro'), webAppUrl: url }]] : undefined;
  }

  private async sendAccountFlow(
    context: TelegramBotApplicationContext,
    userId: string,
    chatId: string,
    locale: ReturnType<typeof financeChatLocale>,
    result: Exclude<AccountFlowResult, null>,
  ) {
    const messages = {
      name: t(locale, 'accountNamePrompt'),
      'invalid-name': t(locale, 'accountInvalidName'),
      balance: t(locale, 'accountBalancePrompt'),
      'invalid-balance': t(locale, 'accountInvalidBalance'),
      'invalid-currency': t(locale, 'accountInvalidCurrency'),
      cancelled: t(locale, 'accountCancelled'),
      currency: result.kind === 'currency' ? t(locale, 'accountCurrencyPrompt', { name: result.name }) : '',
      created: result.kind === 'created' ? t(locale, 'accountCreated', result) : '',
    } as const;
    const text = messages[result.kind];
    await this.delivery.enqueueSendMessage({
      workspaceId: context.bot.workspaceId, botIntegrationId: context.bot.id, telegramBotUserId: userId, chatId, text,
      ...(result.kind === 'currency' ? { replyKeyboard: this.flows.currencyKeyboard() } : {}),
      ...(result.kind === 'balance' ? { replyKeyboard: [[{ text: t(locale, 'zeroBalance') }], [{ text: t(locale, 'cancelFlow') }]] } : {}),
      idempotencyKey: `finance-account-flow:${context.updateLogId}:${result.kind}`,
    });
  }
}
