import { Inject, Injectable } from '@nestjs/common';
import { TelegramBotApplicationType } from '@prisma/client';
import { ApplicationLoggerService } from '../../../operations/application-logs/application-logger.service';
import { TelegramBotUsersService } from './telegram-bot-users.service';
import { TelegramBotLoadingFeedbackService } from './telegram-bot-loading-feedback.service';
import type { TelegramBotApplicationContext } from './telegram-bot-update.types';
import {
  TELEGRAM_BOT_FINANCE_HANDLER,
  TELEGRAM_BOT_GREETER_HANDLER,
  type TelegramBotApplicationHandler,
} from './telegram-bot-application.ports';

@Injectable()
export class TelegramBotApplicationDispatcherService {
  constructor(
    @Inject(TELEGRAM_BOT_GREETER_HANDLER)
    private readonly greeter: TelegramBotApplicationHandler,
    @Inject(TELEGRAM_BOT_FINANCE_HANDLER)
    private readonly finance: TelegramBotApplicationHandler,
    private readonly applicationLogger: ApplicationLoggerService,
    private readonly loadingFeedback: TelegramBotLoadingFeedbackService,
  ) {}

  async dispatch(context: TelegramBotApplicationContext) {
    if (context.bot.applicationType === TelegramBotApplicationType.NONE) {
      this.applicationLogger.writeStructured({
        kind: 'integration',
        level: 'info',
        source: TelegramBotApplicationDispatcherService.name,
        event: 'telegram_bot.update_skipped',
        message:
          'Telegram bot update skipped because no runtime application is selected.',
        workspaceId: context.bot.workspaceId,
        metadata: {
          botIntegrationId: context.bot.id,
          updateLogId: context.updateLogId,
          applicationType: context.bot.applicationType,
        },
      });
      return { handled: false };
    }
    // Finance owns immediate, step-specific feedback. Its live replies must not
    // wait for a temporary message round trip. Greeter retains existing behavior.
    const loading =
      context.bot.applicationType === TelegramBotApplicationType.GREETER
        ? await this.loadingFeedback.show(context)
        : null;
    try {
      switch (context.bot.applicationType) {
        case TelegramBotApplicationType.GREETER:
          await this.greeter.handle(context);
          return { handled: true };
        case TelegramBotApplicationType.FINANCE:
          await this.finance.handle(context);
          return { handled: true };
        default:
          return { handled: false };
      }
    } finally {
      await this.loadingFeedback.remove(loading);
    }
  }
}
