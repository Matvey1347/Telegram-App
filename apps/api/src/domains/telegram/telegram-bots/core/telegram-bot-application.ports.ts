import type { TelegramBotApplicationType } from '@prisma/client';
import type {
  TelegramBotCommand,
  TelegramChatMenuButton,
} from '../../../../telegram/shared/telegram-bot-api.client';
import type { TelegramBotApplicationContext } from './telegram-bot-update.types';

export const TELEGRAM_BOT_GREETER_HANDLER = Symbol(
  'TELEGRAM_BOT_GREETER_HANDLER',
);
export const TELEGRAM_BOT_FINANCE_HANDLER = Symbol(
  'TELEGRAM_BOT_FINANCE_HANDLER',
);
export const TELEGRAM_BOT_GREETER_PRESENTATION = Symbol(
  'TELEGRAM_BOT_GREETER_PRESENTATION',
);
export const TELEGRAM_BOT_FINANCE_PRESENTATION = Symbol(
  'TELEGRAM_BOT_FINANCE_PRESENTATION',
);

export interface TelegramBotApplicationHandler {
  handle(context: TelegramBotApplicationContext): Promise<unknown>;
}

export interface TelegramBotApplicationPresentation {
  readonly applicationType: TelegramBotApplicationType;
  commands(locale?: string): TelegramBotCommand[];
  supportedLocales(): readonly string[];
  menuButton(botIntegrationId: string, locale?: string): TelegramChatMenuButton;
  miniAppUrl(botIntegrationId: string): string | null;
  resolveLocale(preferred: string | null, fallback?: string | null): string;
  localDevelopmentActive?(): boolean;
  localLifecycle?(
    state: 'started' | 'stopped',
    botIntegrationId: string,
    locale: string,
  ): {
    text: string;
    replyKeyboard?: Array<Array<{ text: string; webAppUrl?: string }>>;
  };
}
