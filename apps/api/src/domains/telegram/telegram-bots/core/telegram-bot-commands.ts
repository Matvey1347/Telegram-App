import { TelegramBotApplicationType } from '@prisma/client';
import type { TelegramBotCommand } from '../../../../telegram/shared/telegram-bot-api.client';
import type { FinanceChatLocale } from '../finance/i18n/finance-chat-i18n';

export function commandsForTelegramBot(
  applicationType: TelegramBotApplicationType,
  locale: FinanceChatLocale = 'en',
): TelegramBotCommand[] {
  switch (applicationType) {
    case TelegramBotApplicationType.FINANCE:
      return financeCommands(locale);
    case TelegramBotApplicationType.GREETER:
      return [
        { command: 'start', description: 'Start the welcome flow' },
        { command: 'help', description: 'Show bot help' },
      ];
    default:
      return [];
  }
}

const financeCommandDescriptions: Record<FinanceChatLocale, string[]> = {
  en: ['Open Finance', 'Add an expense', 'Add income', 'Recent transactions', 'Accounts', 'Categories', 'Transfer between accounts', 'Help'],
  uk: ['Відкрити Finance', 'Додати витрату', 'Додати дохід', 'Останні операції', 'Рахунки', 'Категорії', 'Переказ між рахунками', 'Допомога'],
  ru: ['Открыть Finance', 'Добавить расход', 'Добавить доход', 'Последние операции', 'Счета', 'Категории', 'Перевод между счетами', 'Помощь'],
};

export function financeCommands(locale: FinanceChatLocale): TelegramBotCommand[] {
  const [start, expense, income, recent, accounts, categories, transfer, help] = financeCommandDescriptions[locale];
  return [
    { command: 'start', description: start }, { command: 'expense', description: expense },
    { command: 'income', description: income }, { command: 'recent', description: recent },
    { command: 'accounts', description: accounts }, { command: 'categories', description: categories },
    { command: 'transfer', description: transfer }, { command: 'help', description: help },
  ];
}
