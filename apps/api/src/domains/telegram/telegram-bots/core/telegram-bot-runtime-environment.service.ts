import { Injectable } from '@nestjs/common';
import { TelegramBotRuntimeEnvironment } from '@prisma/client';
import { telegramBotRuntimeEnvironmentName } from '../../../../config/deployment-config';

export function configuredTelegramBotRuntimeEnvironment(): TelegramBotRuntimeEnvironment | null {
  const configured = telegramBotRuntimeEnvironmentName();
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
