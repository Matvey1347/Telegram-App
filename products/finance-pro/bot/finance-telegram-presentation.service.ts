import { Injectable } from '@nestjs/common';
import { TelegramBotApplicationType } from '@prisma/client';
import type { TelegramBotApplicationPresentation } from '../core/telegram-bot-application.ports';
import type { TelegramBotCommand } from '../../../../telegram/shared/telegram-bot-api.client';
import {
  financeChatMenuButton,
  financeMainMenu,
  financeMiniAppUrl,
} from '../../consumer-finance/telegram-presentation/finance-telegram-menu';
import {
  financeChatLocale,
  type FinanceChatLocale,
} from '../../consumer-finance/i18n/finance-chat-i18n';
import { publicWebOrigin } from '../../../../config/deployment-config';

const COMMAND_DESCRIPTIONS: Record<FinanceChatLocale, string[]> = {
  en: [
    'Open Finance',
    'Add an expense',
    'Add income',
    'Recent transactions',
    'Accounts',
    'Categories',
    'Transfer between accounts',
    'Help',
  ],
  uk: [
    'Відкрити Finance',
    'Додати витрату',
    'Додати дохід',
    'Останні операції',
    'Рахунки',
    'Категорії',
    'Переказ між рахунками',
    'Допомога',
  ],
  ru: [
    'Открыть Finance',
    'Добавить расход',
    'Добавить доход',
    'Последние операции',
    'Счета',
    'Категории',
    'Перевод между счетами',
    'Помощь',
  ],
};

const LOCAL_LIFECYCLE = {
  started: {
    uk: '✅ Локальну версію Finance запущено. Посилання Mini App оновлено.',
    ru: '✅ Локальная версия Finance запущена. Ссылка Mini App обновлена.',
    en: '✅ Local Finance is running. The Mini App link has been refreshed.',
  },
  stopped: {
    uk: 'Локальну версію Finance не запущено. Запустіть pnpm dev:bots, а потім надішліть /start.',
    ru: 'Локальная версия Finance не запущена. Запустите pnpm dev:bots, затем отправьте /start.',
    en: 'Local Finance is not running. Start pnpm dev:bots, then send /start.',
  },
} as const;

@Injectable()
export class FinanceTelegramPresentationService implements TelegramBotApplicationPresentation {
  readonly applicationType = TelegramBotApplicationType.FINANCE;

  commands(locale = 'en'): TelegramBotCommand[] {
    const resolved = this.resolveLocale(locale);
    const [
      start,
      expense,
      income,
      recent,
      accounts,
      categories,
      transfer,
      help,
    ] = COMMAND_DESCRIPTIONS[resolved];
    return [
      { command: 'start', description: start },
      { command: 'expense', description: expense },
      { command: 'income', description: income },
      { command: 'recent', description: recent },
      { command: 'accounts', description: accounts },
      { command: 'categories', description: categories },
      { command: 'transfer', description: transfer },
      { command: 'help', description: help },
    ];
  }

  supportedLocales() {
    return ['uk', 'ru', 'en'] as const;
  }

  menuButton(botIntegrationId: string, locale = 'en') {
    return financeChatMenuButton(botIntegrationId, this.resolveLocale(locale));
  }

  miniAppUrl(botIntegrationId: string) {
    return financeMiniAppUrl(botIntegrationId);
  }

  resolveLocale(preferred: string | null, fallback?: string | null) {
    return financeChatLocale(preferred, fallback);
  }

  localDevelopmentActive() {
    return Boolean(publicWebOrigin());
  }

  localLifecycle(
    state: 'started' | 'stopped',
    botIntegrationId: string,
    locale: string,
  ) {
    const resolved = this.resolveLocale(locale);
    return {
      text: LOCAL_LIFECYCLE[state][resolved],
      ...(state === 'started'
        ? { replyKeyboard: financeMainMenu(botIntegrationId, resolved) }
        : {}),
    };
  }
}
