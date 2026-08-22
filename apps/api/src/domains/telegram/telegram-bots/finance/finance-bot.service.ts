import { Injectable } from '@nestjs/common';
import { TelegramBotUsersService } from '../core/telegram-bot-users.service';
import { TelegramBotDeliveryService } from '../core/telegram-bot-delivery.service';
import { TelegramBotInteractiveReplyService } from '../../../../telegram/shared/telegram-bot-interactive-reply.service';
import { FinanceContextService } from './finance-context.service';
import { FinanceProposalService } from './finance-proposal.service';
import { FinanceAiProviderService } from './finance-ai.provider';
import { FinanceEntitlementService } from './finance-entitlement.service';
import { TelegramBotApiClient } from '../../../../telegram/shared/telegram-bot-api.client';
import { BotBillingService } from '../../bot-billing/bot-billing.service';
import type { TelegramBotApplicationContext } from '../core/telegram-bot-update.types';
import {
  financeCategoryEmoji,
  FinanceBotChatResponderService,
} from './finance-bot-chat-responder.service';
import {
  acknowledgeFinanceCallback,
  sendFinanceTyping,
} from './finance-bot-telegram-interactions';
import { financeChatLocale, t } from './i18n/finance-chat-i18n';
import {
  FinanceChatFlowService,
  type FinanceFlowCallback,
  type FinanceFlowResult,
} from './finance-chat-flow.service';
import { FinanceChatFlowPresenterService } from './finance-chat-flow-presenter.service';
import { FinanceBotFlowMessenger } from './finance-bot-flow-messenger';
import {
  parseFinanceChatCommand,
  parseFinanceMenuText,
  parseFinanceQuickInput,
} from './finance-chat-input-parser';
import { financeBotProButtons } from './finance-bot-pro-buttons';
import { warnSlowFinanceContext } from './finance-bot-observability';
import { FinanceBotBrowserLogin } from './finance-bot-browser-login';

@Injectable()
export class FinanceBotService {
  private readonly flowMessages: FinanceBotFlowMessenger;

  constructor(
    private readonly users: TelegramBotUsersService,
    private readonly contexts: FinanceContextService,
    private readonly proposals: FinanceProposalService,
    private readonly interactive: TelegramBotInteractiveReplyService,
    private readonly durable: TelegramBotDeliveryService,
    private readonly ai: FinanceAiProviderService,
    private readonly entitlements: FinanceEntitlementService,
    private readonly botApi: TelegramBotApiClient,
    private readonly billing: BotBillingService,
    private readonly chat: FinanceBotChatResponderService,
    private readonly flows: FinanceChatFlowService,
    private readonly browserLogin: FinanceBotBrowserLogin,
    flowPresenter: FinanceChatFlowPresenterService,
  ) {
    this.flowMessages = new FinanceBotFlowMessenger(
      interactive,
      chat,
      flows,
      flowPresenter,
    );
  }

  async handle(context: TelegramBotApplicationContext) {
    const incomingCallback = context.update.callback_query;
    if (incomingCallback?.id) {
      await acknowledgeFinanceCallback(
        this.botApi,
        context.token,
        incomingCallback.id,
        '',
      );
    }
    const contextStartedAt = Date.now();
    const user = await this.users.upsertFromUpdate({
      workspaceId: context.bot.workspaceId,
      botIntegrationId: context.bot.id,
      runtimeInstanceId: context.runtime.id,
      update: context.update,
    });
    if (!user) return;
    const profile = await this.contexts.ensureProfile(context.bot.id, user.id);
    warnSlowFinanceContext(context.runtime.id, Date.now() - contextStartedAt);
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
    if (await this.browserLogin.handle(context, chatId, profile.id, locale))
      return;
    const successfulPayment = context.update.message?.successful_payment;
    if (successfulPayment) {
      await this.billing.processStarsPayment({
        botIntegrationId: context.bot.id,
        telegramBotUserId: user.id,
        payment: successfulPayment,
      });
      await this.durable.enqueueSendMessage({
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
    if (callback?.data?.startsWith('fin:flow:')) {
      const [, , action, argument] = callback.data.split(':');
      const separator = argument?.indexOf('.') ?? -1;
      const selectionAction = [
        'account',
        'category',
        'parent',
        'type',
        'currency',
        'language',
        'page',
        'emoji',
      ].includes(action);
      const revision =
        separator >= 0
          ? argument.slice(0, separator)
          : selectionAction
            ? undefined
            : argument;
      const callbackId =
        separator >= 0
          ? argument.slice(separator + 1)
          : selectionAction
            ? argument
            : undefined;
      const entityId = [
        'edit-account',
        'edit-category',
        'archive-category',
      ].includes(action)
        ? argument
        : callbackId;
      const flowInput = {
        profileId: profile.id,
        botIntegrationId: context.bot.id,
        telegramBotUserId: user.id,
      };
      let result: FinanceFlowResult;
      try {
        if (action === 'start-expense' || action === 'start-income') {
          result = await this.flows.startTransaction({
            ...flowInput,
            type: action === 'start-expense' ? 'EXPENSE' : 'INCOME',
          });
        } else if (action === 'start-account')
          result = await this.flows.start({
            ...flowInput,
            flow: 'ACCOUNT_CREATE',
          });
        else if (action === 'start-category')
          result = await this.flows.startCategory(flowInput);
        else if (action === 'start-transfer')
          result = await this.flows.startTransfer(flowInput);
        else if (action === 'start-language')
          result = await this.flows.startLanguage(flowInput);
        else if (action === 'edit-account' && entityId)
          result = await this.flows.startAccountEdit({
            ...flowInput,
            accountId: entityId,
          });
        else if (action === 'edit-category' && entityId)
          result = await this.flows.startCategoryEdit({
            ...flowInput,
            categoryId: entityId,
          });
        else if (action === 'archive-category' && entityId)
          result = await this.flows.startCategoryArchive({
            ...flowInput,
            categoryId: entityId,
          });
        else if (
          [
            'back',
            'cancel',
            'confirm',
            'skip',
            'account',
            'category',
            'parent',
            'type',
            'currency',
            'language',
            'page',
            'emoji',
          ].includes(action)
        )
          result = await this.flows.consumeCallback({
            ...flowInput,
            callback: callbackId
              ? {
                  action: action as Extract<
                    FinanceFlowCallback,
                    { id: string }
                  >['action'],
                  id: callbackId,
                  revision,
                }
              : {
                  action: action as Extract<
                    FinanceFlowCallback,
                    { action: 'back' | 'cancel' | 'confirm' | 'skip' }
                  >['action'],
                  revision,
                },
          });
        else result = null;
      } catch {
        await this.chat.sendSafe(
          context,
          user.id,
          chatId,
          t(locale, 'flowFailed'),
          `finance-flow-error:${context.updateLogId}`,
        );
        return;
      }
      if (result && result.kind !== 'invalid')
        await this.flowMessages.send(
          context,
          user.id,
          chatId,
          locale,
          result,
          profile.id,
          callback.message?.message_id,
        );
      else if (action === 'start-expense' || action === 'start-income')
        await this.chat.sendAccounts(
          context,
          user.id,
          profile.id,
          chatId,
          locale,
        );
      return;
    }
    if (callback?.data === 'fin:account:add') {
      await this.flows.startAccount(profile.id, context.bot.id, user.id);
      await this.flowMessages.sendLegacyAccount(context, chatId, locale, {
        kind: 'name',
      });
      return;
    }
    if (callback?.data?.startsWith('fin:')) {
      const [, action, token] = callback.data.split(':');
      if (!token || !['save', 'cancel'].includes(action)) {
        await this.chat.sendSafe(
          context,
          user.id,
          chatId,
          t(locale, 'unavailable'),
          `finance-callback-unavailable:${context.updateLogId}`,
        );
        return;
      }
      if (action === 'save') {
        let saved: Awaited<ReturnType<FinanceProposalService['confirm']>>;
        try {
          saved = await this.proposals.confirm({
            token,
            botIntegrationId: context.bot.id,
            telegramBotUserId: user.id,
            profile,
          });
        } catch {
          await this.interactive.send(context.token, chatId, {
            text: t(locale, 'proposalExpired'),
          });
          return;
        }
        await this.interactive.send(context.token, chatId, {
          text: t(locale, 'saved', {
            count: saved.transactionIds?.length || 1,
          }),
        });
      } else {
        try {
          await this.proposals.cancel({
            token,
            botIntegrationId: context.bot.id,
            telegramBotUserId: user.id,
          });
          await this.interactive.send(context.token, chatId, {
            text: t(locale, 'cancelled'),
          });
        } catch {
          await this.interactive.send(context.token, chatId, {
            text: t(locale, 'proposalExpired'),
          });
        }
      }
      return;
    }
    const message = context.update.message;
    const voice = message?.voice;
    if (voice?.file_id) {
      const entitled = await this.entitlements.has(
        {
          botIntegrationId: context.bot.id,
          telegramBotUserId: user.id,
          profileId: profile.id,
        },
        'AI_INPUT',
      );
      if (!entitled) {
        await this.interactive.send(context.token, chatId, {
          text: t(locale, 'aiGate'),
          inlineButtons: financeBotProButtons(context.bot.id, locale),
        });
        return;
      }
      if (voice.file_size && voice.file_size > 8 * 1024 * 1024) {
        await this.chat.sendSafe(
          context,
          user.id,
          chatId,
          t(locale, 'voiceLarge'),
          `finance-voice-too-large:${context.updateLogId}`,
        );
        return;
      }
      await sendFinanceTyping(this.botApi, context.token, chatId);
      try {
        const token = context.token;
        const telegramFile = await this.botApi.getFile(token, voice.file_id);
        if (!telegramFile.file_path) throw new Error('Missing voice file path');
        const downloaded = await this.botApi.downloadFile(
          token,
          telegramFile.file_path,
          8 * 1024 * 1024,
        );
        const text = await this.ai.transcribeVoice({
          profileId: profile.id,
          botIntegrationId: context.bot.id,
          bytes: downloaded.bytes,
          mime: voice.mime_type || downloaded.contentType.split(';')[0],
        });
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
        await this.interactive.send(context.token, chatId, {
          text: `${t(locale, 'suggested', { count: proposal.operations.length })}\n\n${this.chat.batchPreview(proposal.preview, locale)}\n\n${t(locale, 'review')}`,
          inlineButtons: this.chat.proposalButtons(
            proposal.token,
            t(locale, 'saveAll'),
            locale,
          ),
        });
      } catch {
        await this.chat.sendSafe(
          context,
          user.id,
          chatId,
          t(locale, 'voiceError'),
          `finance-voice-error:${context.updateLogId}`,
        );
      }
      return;
    }
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
        {
          botIntegrationId: context.bot.id,
          telegramBotUserId: user.id,
          profileId: profile.id,
        },
        'RECEIPT_SCAN',
      );
      if (!entitled) {
        await this.interactive.send(context.token, chatId, {
          text: t(locale, 'receiptGate'),
          inlineButtons: financeBotProButtons(context.bot.id, locale),
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
      await sendFinanceTyping(this.botApi, context.token, chatId);
      try {
        const token = context.token;
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
        await this.interactive.send(context.token, chatId, {
          text: `${t(locale, 'receiptProposal')}\n\n${this.chat.batchPreview(proposal.preview, locale)}\n\n${t(locale, 'review')}`,
          inlineButtons: this.chat.proposalButtons(
            proposal.token,
            t(locale, 'saveReceipt'),
            locale,
          ),
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
      const result = await this.flows.cancelFlow({
        profileId: profile.id,
        botIntegrationId: context.bot.id,
        telegramBotUserId: user.id,
      });
      if (result)
        await this.flowMessages.send(
          context,
          user.id,
          chatId,
          locale,
          result,
          profile.id,
        );
      if (result) return;
    }
    const command = text ? parseFinanceChatCommand(text) : null;
    const persistedMenuCommand = text ? parseFinanceMenuText(text) : null;
    const menuAction =
      Boolean(command) ||
      Boolean(persistedMenuCommand) ||
      [
        'Add income',
        'Add expense',
        'Open Finance',
        'Recent transactions',
        'Accounts',
        'Categories',
        'Transfer',
        'Help',
      ].includes(text || '');
    if (text && !menuAction) {
      const flow = await (this.flows.consumeText?.({
        profileId: profile.id,
        botIntegrationId: context.bot.id,
        telegramBotUserId: user.id,
        text,
      }) ??
        this.flows.consume({
          profileId: profile.id,
          botIntegrationId: context.bot.id,
          telegramBotUserId: user.id,
          text,
        }));
      if (flow) {
        if (!['invalid', 'expired'].includes(flow.kind) && message?.message_id)
          try {
            await this.botApi.deleteMessage(context.token, {
              chat_id: chatId,
              message_id: message.message_id,
            });
          } catch {
            /* Cleanup is best effort; keep the accepted finance input. */
          }
        await this.flowMessages.send(
          context,
          user.id,
          chatId,
          locale,
          flow,
          profile.id,
        );
        return;
      }
    }
    if (command === 'start') {
      await this.chat.sendMainMenu(context, user.id, chatId, locale);
      return;
    }
    if (
      command === 'income' ||
      persistedMenuCommand === 'income' ||
      text === t(locale, 'menuIncome') ||
      text === 'Add income'
    ) {
      const result = await this.flows.startTransaction({
        profileId: profile.id,
        botIntegrationId: context.bot.id,
        telegramBotUserId: user.id,
        type: 'INCOME',
      });
      if (!result) {
        await this.chat.sendAccounts(
          context,
          user.id,
          profile.id,
          chatId,
          locale,
        );
        return;
      }
      await this.flowMessages.send(
        context,
        user.id,
        chatId,
        locale,
        result,
        profile.id,
      );
      return;
    }
    if (
      command === 'expense' ||
      persistedMenuCommand === 'expense' ||
      text === t(locale, 'menuExpense') ||
      text === 'Add expense'
    ) {
      const result = await this.flows.startTransaction({
        profileId: profile.id,
        botIntegrationId: context.bot.id,
        telegramBotUserId: user.id,
        type: 'EXPENSE',
      });
      if (!result) {
        await this.chat.sendAccounts(
          context,
          user.id,
          profile.id,
          chatId,
          locale,
        );
        return;
      }
      await this.flowMessages.send(
        context,
        user.id,
        chatId,
        locale,
        result,
        profile.id,
      );
      return;
    }
    if (persistedMenuCommand === 'open' || text === 'Open Finance') {
      await this.chat.sendFinanceCta(
        context,
        user.id,
        chatId,
        `finance-open:${context.updateLogId}`,
        locale,
      );
      return;
    }
    if (
      command === 'recent' ||
      persistedMenuCommand === 'recent' ||
      text === t(locale, 'menuRecent') ||
      text === 'Recent transactions'
    ) {
      await this.chat.sendRecentTransactions(
        context,
        user.id,
        profile.id,
        chatId,
        locale,
      );
      return;
    }
    if (
      command === 'accounts' ||
      persistedMenuCommand === 'accounts' ||
      text === t(locale, 'menuAccounts') ||
      text === 'Accounts'
    ) {
      await this.chat.sendAccounts(
        context,
        user.id,
        profile.id,
        chatId,
        locale,
      );
      return;
    }
    if (
      command === 'categories' ||
      persistedMenuCommand === 'categories' ||
      text === t(locale, 'menuCategories') ||
      text === 'Categories'
    ) {
      await this.chat.sendCategories(
        context,
        user.id,
        profile.id,
        chatId,
        locale,
      );
      return;
    }
    if (
      command === 'transfer' ||
      persistedMenuCommand === 'transfer' ||
      text === t(locale, 'menuTransfer') ||
      text === 'Transfer'
    ) {
      const accounts = await this.flows.activeAccounts(profile.id);
      if (accounts.length < 2)
        await this.chat.sendTransfer(
          context,
          user.id,
          profile.id,
          chatId,
          locale,
          accounts.length,
        );
      else
        await this.flowMessages.send(
          context,
          user.id,
          chatId,
          locale,
          await this.flows.startTransfer({
            profileId: profile.id,
            botIntegrationId: context.bot.id,
            telegramBotUserId: user.id,
          }),
          profile.id,
        );
      return;
    }
    if (command === 'settings' || persistedMenuCommand === 'settings') {
      await this.chat.sendSettings(
        context,
        chatId,
        locale,
        profile.defaultCurrency,
      );
      return;
    }
    if (
      command === 'help' ||
      persistedMenuCommand === 'help' ||
      text === t(locale, 'menuHelp') ||
      text === 'Help'
    ) {
      await this.interactive.send(context.token, chatId, {
        text: t(locale, 'help'),
      });
      return;
    }
    if (!text) return;
    const parsed = parseFinanceQuickInput(text);
    if (!parsed) {
      const entitled = await this.entitlements.has(
        {
          botIntegrationId: context.bot.id,
          telegramBotUserId: user.id,
          profileId: profile.id,
        },
        'AI_INPUT',
      );
      if (!entitled) {
        await this.interactive.send(context.token, chatId, {
          text: t(locale, 'aiGate'),
          inlineButtons: financeBotProButtons(context.bot.id, locale),
        });
        return;
      }
      await sendFinanceTyping(this.botApi, context.token, chatId);
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
        await this.interactive.send(context.token, chatId, {
          text: `${t(locale, 'suggested', { count: proposal.operations.length })}\n\n${this.chat.batchPreview(proposal.preview, locale)}\n\n${t(locale, 'review')}`,
          inlineButtons: this.chat.proposalButtons(
            proposal.token,
            t(locale, 'saveAll'),
            locale,
          ),
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
    const label =
      proposal.payload.type === 'EXPENSE'
        ? `💸 ${t(locale, 'expense')}`
        : `💰 ${t(locale, 'incomeLabel')}`;
    await this.interactive.send(context.token, chatId, {
      text: `${label}\n\n💳 ${t(locale, 'amount')}: ${proposal.payload.amount} ${proposal.payload.currency}\n${financeCategoryEmoji(proposal.category?.name)} ${t(locale, 'category')}: ${proposal.category?.name || t(locale, 'other')}\n🏦 ${t(locale, 'account')}: ${proposal.account.name}\n📝 ${t(locale, 'description')}: ${proposal.payload.description || t(locale, 'notProvided')}\n\n${t(locale, 'review')}`,
      inlineButtons: this.chat.proposalButtons(
        proposal.token,
        t(locale, 'save'),
        locale,
      ),
    });
  }
}
