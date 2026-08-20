import { Injectable } from '@nestjs/common';
import { TelegramBotRuntimeEnvironment } from '@prisma/client';

export function configuredTelegramBotRuntimeEnvironment(): TelegramBotRuntimeEnvironment | null {
  const configured =
    process.env.TELEGRAM_BOT_RUNTIME_ENVIRONMENT?.trim().toUpperCase();
  if (configured === TelegramBotRuntimeEnvironment.LOCAL) {
    return TelegramBotRuntimeEnvironment.LOCAL;
  }
  if (configured === TelegramBotRuntimeEnvironment.PRODUCTION) {
    return TelegramBotRuntimeEnvironment.PRODUCTION;
  }
  return null;
}

/** Resolves the single workspace-bot environment this API process may operate. */
@Injectable()
export class TelegramBotRuntimeEnvironmentService {
  current(): TelegramBotRuntimeEnvironment | null {
    return configuredTelegramBotRuntimeEnvironment();
  }

  owns(environment: TelegramBotRuntimeEnvironment) {
    return this.current() === environment;
  }
}
