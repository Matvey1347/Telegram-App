import type { FinanceChatLocale } from '../../consumer-finance/i18n/finance-chat-i18n';

const COPY = {
  en: {
    debtDue: (name: string, amount: string, currency: string) =>
      `Debt due: ${name}\n${amount} ${currency}`,
    regularDue: (name: string, amount: string, currency: string) =>
      `Regular payment due: ${name}\n${amount} ${currency}`,
    confirm: 'Confirm payment',
    changeAmount: 'Change amount',
    openDebts: 'Open debts',
    openRegularPayments: 'Open regular payments',
    confirmed: 'Payment confirmed and added to transactions.',
    alreadyConfirmed: 'This payment was already confirmed.',
    unavailable: 'This regular payment action is no longer available.',
  },
  uk: {
    debtDue: (name: string, amount: string, currency: string) =>
      `Строк боргу настав: ${name}\n${amount} ${currency}`,
    regularDue: (name: string, amount: string, currency: string) =>
      `Час регулярного платежу: ${name}\n${amount} ${currency}`,
    confirm: 'Підтвердити платіж',
    changeAmount: 'Змінити суму',
    openDebts: 'Відкрити борги',
    openRegularPayments: 'Відкрити регулярні платежі',
    confirmed: 'Платіж підтверджено й додано до операцій.',
    alreadyConfirmed: 'Цей платіж уже підтверджено.',
    unavailable: 'Ця дія для регулярного платежу вже недоступна.',
  },
  ru: {
    debtDue: (name: string, amount: string, currency: string) =>
      `Срок долга наступил: ${name}\n${amount} ${currency}`,
    regularDue: (name: string, amount: string, currency: string) =>
      `Время регулярного платежа: ${name}\n${amount} ${currency}`,
    confirm: 'Подтвердить платёж',
    changeAmount: 'Изменить сумму',
    openDebts: 'Открыть долги',
    openRegularPayments: 'Открыть регулярные платежи',
    confirmed: 'Платёж подтверждён и добавлен в операции.',
    alreadyConfirmed: 'Этот платёж уже подтверждён.',
    unavailable: 'Это действие для регулярного платежа уже недоступно.',
  },
} as const;

export function financeObligationCopy(locale: FinanceChatLocale) {
  return COPY[locale];
}
