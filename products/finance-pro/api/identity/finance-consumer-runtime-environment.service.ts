import { Injectable } from '@nestjs/common';
import type { TelegramBotRuntimeEnvironment } from '@prisma/client';
import { configuredTelegramBotRuntimeEnvironment } from '../../telegram-bots/core/telegram-bot-runtime-environment.service';

/** Selects the one exact runtime accepted by Finance consumer authentication. */
@Injectable()
export class FinanceConsumerRuntimeEnvironmentService {
  current(): TelegramBotRuntimeEnvironment | null {
    return configuredTelegramBotRuntimeEnvironment();
  }
}
