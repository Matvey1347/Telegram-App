import type { TelegramBotMessage } from '../../../../telegram/shared/telegram-bot-message';
import type { FinanceChatLocale } from '../i18n/finance-chat-i18n';

export const FINANCE_OBLIGATION_PRESENTATION = Symbol(
  'FINANCE_OBLIGATION_PRESENTATION',
);

export type FinanceObligationPresentationPort = {
  debtDue(input: {
    botIntegrationId: string;
    debtName: string;
    amount: string;
    currency: string;
    locale: FinanceChatLocale;
  }): TelegramBotMessage;
  regularPaymentDue(input: {
    botIntegrationId: string;
    regularPaymentId: string;
    name: string;
    amount: string;
    currency: string;
    expectedOccurrenceAt: Date;
    configVersion: number;
    locale: FinanceChatLocale;
  }): TelegramBotMessage;
};
