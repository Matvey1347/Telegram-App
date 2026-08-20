import { Injectable } from '@nestjs/common';
import { TelegramBotApplicationType } from '@prisma/client';
import { ApplicationLoggerService } from '../../../operations/application-logs/application-logger.service';
import { TelegramBotUsersService } from './telegram-bot-users.service';
import { GreeterService } from '../greeter/greeter.service';
import { FinanceBotService } from '../finance/finance-bot.service';
import { TelegramBotLoadingFeedbackService } from './telegram-bot-loading-feedback.service';
import type { TelegramBotApplicationContext } from './telegram-bot-update.types';

@Injectable()
export class TelegramBotGreeterHandler {
  constructor(private readonly greeter: GreeterService) {}

  async handle(context: TelegramBotApplicationContext) {
    await this.greeter.handle(context);
  }
}

@Injectable()
export class TelegramBotFinanceHandler {
  constructor(private readonly finance: FinanceBotService) {}

  async handle(context: TelegramBotApplicationContext) {
    await this.finance.handle(context);
  }
}

@Injectable()
export class TelegramBotApplicationDispatcherService {
  constructor(
    private readonly greeter: TelegramBotGreeterHandler,
    private readonly finance: TelegramBotFinanceHandler,
    private readonly applicationLogger: ApplicationLoggerService,
    private readonly loadingFeedback: TelegramBotLoadingFeedbackService,
  ) {}

  async dispatch(context: TelegramBotApplicationContext) {
    if (context.bot.applicationType === TelegramBotApplicationType.NONE) {
      this.applicationLogger.writeStructured({
        kind: 'integration', level: 'info', source: TelegramBotApplicationDispatcherService.name,
        event: 'telegram_bot.update_skipped',
        message: 'Telegram bot update skipped because no runtime application is selected.',
        workspaceId: context.bot.workspaceId,
        metadata: { botIntegrationId: context.bot.id, updateLogId: context.updateLogId, applicationType: context.bot.applicationType },
      });
      return { handled: false };
    }
    const loading = await this.loadingFeedback.show(context);
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
