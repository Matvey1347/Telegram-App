import { Injectable } from '@nestjs/common';
import { TelegramBotApplicationType } from '@prisma/client';
import type { TelegramBotApplicationPresentation } from '../core/telegram-bot-application.ports';

@Injectable()
export class GreeterTelegramPresentationService implements TelegramBotApplicationPresentation {
  readonly applicationType = TelegramBotApplicationType.GREETER;

  commands() {
    return [
      { command: 'start', description: 'Start the welcome flow' },
      { command: 'help', description: 'Show bot help' },
    ];
  }

  supportedLocales() {
    return [];
  }

  menuButton() {
    return { type: 'commands' as const };
  }

  miniAppUrl() {
    return null;
  }

  resolveLocale(preferred: string | null, fallback?: string | null) {
    return preferred || fallback || 'en';
  }
}
