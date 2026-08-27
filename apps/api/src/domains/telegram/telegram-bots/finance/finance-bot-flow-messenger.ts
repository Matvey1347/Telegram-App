import { TelegramBotInteractiveReplyService } from '../../../../telegram/shared/telegram-bot-interactive-reply.service';
import { telegramMarkupToHtml } from '../../../../telegram/shared/telegram-markup';
import type { TelegramBotApplicationContext } from '../core/telegram-bot-update.types';
import { FinanceBotChatResponderService } from './finance-bot-chat-responder.service';
import { FinanceChatFlowPresenterService } from '../../consumer-finance/chat-flows/finance-chat-flow-presenter.service';
import { FinanceBotIconInputService } from './finance-bot-icon-input.service';
import {
  FinanceChatFlowService,
  type AccountFlowResult,
  type FinanceFlowResult,
} from '../../consumer-finance/chat-flows/finance-chat-flow.service';
import {
  financeChatLocale,
  t,
} from '../../consumer-finance/i18n/finance-chat-i18n';

export class FinanceBotFlowMessenger {
  constructor(
    private readonly interactive: TelegramBotInteractiveReplyService,
    private readonly chat: FinanceBotChatResponderService,
    private readonly flows: FinanceChatFlowService,
    private readonly presenter: FinanceChatFlowPresenterService,
    private readonly iconInput: FinanceBotIconInputService,
  ) {}

  async handleIcon(
    context: TelegramBotApplicationContext,
    userId: string,
    chatId: string,
    locale: ReturnType<typeof financeChatLocale>,
    profileId: string,
    message: NonNullable<TelegramBotApplicationContext['update']['message']>,
  ) {
    const icon = await this.iconInput.consume(
      context.token,
      chatId,
      {
        profileId,
        botIntegrationId: context.bot.id,
        telegramBotUserId: userId,
      },
      message,
    );
    if (!icon.handled) return false;
    if ('result' in icon && icon.result)
      await this.send(context, userId, chatId, locale, icon.result, profileId);
    else
      await this.chat.sendSafe(
        context,
        userId,
        chatId,
        t(locale, 'flowIconInvalid'),
        `finance-flow-icon-error:${context.updateLogId}`,
      );
    return true;
  }

  async send(
    context: TelegramBotApplicationContext,
    userId: string,
    chatId: string,
    locale: ReturnType<typeof financeChatLocale>,
    result: FinanceFlowResult,
    profileId: string,
    replaceMessageId?: number,
  ) {
    if (!result) return;
    const stored =
      'payload' in result && result.payload?.messageId
        ? Number(result.payload.messageId)
        : undefined;
    const target =
      replaceMessageId ?? (Number.isInteger(stored) ? stored : undefined);
    if (result.kind === 'cancelled' || result.kind === 'expired') {
      await this.replaceOrSend(context.token, chatId, target, {
        text: t(
          locale,
          result.kind === 'cancelled' ? 'cancelled' : 'flowExpired',
        ),
        removeInlineKeyboard: true,
      });
      return;
    }
    if (result.kind === 'created' || result.kind === 'updated') {
      const resultLocale =
        result.flow === 'SETTINGS_LANGUAGE' && result.payload.locale
          ? financeChatLocale(result.payload.locale, null)
          : locale;
      await this.replaceOrSend(context.token, chatId, target, {
        text: this.presenter.completionText(resultLocale, result),
        removeInlineKeyboard: true,
      });
      if (result.flow === 'SETTINGS_LANGUAGE')
        await this.chat.sendMainMenu(context, userId, chatId, resultLocale);
      return;
    }
    if (result.kind === 'invalid') {
      await this.chat.sendSafe(
        context,
        userId,
        chatId,
        result.reason === 'amount'
          ? t(locale, 'accountInvalidBalance')
          : result.reason === 'currency'
            ? t(locale, 'accountInvalidCurrency')
            : t(locale, 'unavailable'),
        `finance-flow-invalid:${context.updateLogId}:${result.reason}`,
      );
      return;
    }
    if (result.kind !== 'prompt' && result.kind !== 'review') return;
    const presented = await this.presenter.present(profileId, locale, result);
    if (!presented) return;
    const message = {
      ...presented,
      text: telegramMarkupToHtml(presented.text),
      parseMode: 'HTML',
    };
    if (target !== undefined)
      try {
        await this.interactive.edit(context.token, chatId, target, message);
        await this.bind(context, userId, profileId, result, target);
        return;
      } catch {
        // Telegram can reject edits of old messages; send and track one replacement.
      }
    const sent = await this.interactive.send(context.token, chatId, message);
    if (sent?.message_id)
      await this.bind(context, userId, profileId, result, sent.message_id);
  }

  private async replaceOrSend(
    token: string,
    chatId: string,
    messageId: number | undefined,
    message: { text: string; removeInlineKeyboard: true },
  ) {
    if (messageId !== undefined)
      try {
        await this.interactive.edit(token, chatId, messageId, message);
        return;
      } catch {
        // Preserve the terminal result if Telegram no longer accepts edits.
      }
    await this.interactive.send(token, chatId, message);
  }

  private async bind(
    context: TelegramBotApplicationContext,
    userId: string,
    profileId: string,
    result: Extract<FinanceFlowResult, { kind: 'prompt' | 'review' }>,
    messageId: number,
  ) {
    try {
      await this.flows.bindMessage(
        {
          profileId,
          botIntegrationId: context.bot.id,
          telegramBotUserId: userId,
        },
        result.payload.revision ?? undefined,
        messageId,
      );
    } catch {
      // The callback still identifies the current message if persistence fails.
    }
  }

  async sendLegacyAccount(
    context: TelegramBotApplicationContext,
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
      currency:
        result.kind === 'currency'
          ? t(locale, 'accountCurrencyPrompt', { name: result.name })
          : '',
      created:
        result.kind === 'created' ? t(locale, 'accountCreated', result) : '',
    } as const;
    await this.interactive.send(context.token, chatId, {
      text: messages[result.kind],
      ...(result.kind === 'currency'
        ? { replyKeyboard: this.flows.currencyKeyboard() }
        : {}),
      ...(result.kind === 'balance'
        ? {
            replyKeyboard: [
              [{ text: t(locale, 'zeroBalance') }],
              [{ text: t(locale, 'cancelFlow') }],
            ],
          }
        : {}),
    });
  }
}
