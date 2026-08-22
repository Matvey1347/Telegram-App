import { Inject, Injectable } from '@nestjs/common';
import { TelegramBotApplicationType } from '@prisma/client';
import { TelegramBotApiClient } from '../../../../telegram/shared/telegram-bot-api.client';
import {
  TELEGRAM_BOT_FINANCE_PRESENTATION,
  TELEGRAM_BOT_GREETER_PRESENTATION,
  type TelegramBotApplicationPresentation,
} from './telegram-bot-application.ports';

@Injectable()
export class TelegramBotRuntimePresentationService {
  constructor(
    private readonly botApi: TelegramBotApiClient,
    @Inject(TELEGRAM_BOT_GREETER_PRESENTATION)
    private readonly greeter: TelegramBotApplicationPresentation,
    @Inject(TELEGRAM_BOT_FINANCE_PRESENTATION)
    private readonly finance: TelegramBotApplicationPresentation,
  ) {}

  async reconcile(
    token: string,
    applicationType: TelegramBotApplicationType,
    botIntegrationId: string,
  ) {
    const presentation = this.application(applicationType);
    const commands = presentation?.commands() ?? [];
    await this.botApi.setMyCommands(token, commands);
    if (presentation) {
      await Promise.all(
        presentation
          .supportedLocales()
          .map((locale) =>
            this.botApi.setMyCommands(
              token,
              presentation.commands(locale),
              locale,
            ),
          ),
      );
    }
    await this.botApi.setChatMenuButton(
      token,
      presentation?.menuButton(botIntegrationId) ?? { type: 'commands' },
    );
    return { miniAppUrl: presentation?.miniAppUrl?.(botIntegrationId) ?? null };
  }

  application(applicationType: TelegramBotApplicationType) {
    if (applicationType === TelegramBotApplicationType.FINANCE)
      return this.finance;
    if (applicationType === TelegramBotApplicationType.GREETER)
      return this.greeter;
    return null;
  }
}
