import { Injectable } from '@nestjs/common';
import { TelegramBotApplicationType } from '@prisma/client';
import { TelegramBotApiClient } from '../../../../telegram/shared/telegram-bot-api.client';
import { financeChatMenuButton } from '../finance/finance-bot-chat-responder.service';
import { commandsForTelegramBot } from './telegram-bot-commands';

@Injectable()
export class TelegramBotRuntimePresentationService {
  constructor(private readonly botApi: TelegramBotApiClient) {}

  async reconcile(
    token: string,
    applicationType: TelegramBotApplicationType,
    botIntegrationId: string,
  ) {
    const commands = commandsForTelegramBot(applicationType);
    await this.botApi.setMyCommands(token, commands);
    if (applicationType === TelegramBotApplicationType.FINANCE) {
      await Promise.all(
        (['uk', 'ru', 'en'] as const).map((locale) =>
          this.botApi.setMyCommands(
            token,
            commandsForTelegramBot(applicationType, locale),
            locale,
          ),
        ),
      );
    }
    await this.botApi.setChatMenuButton(
      token,
      applicationType === TelegramBotApplicationType.FINANCE
        ? financeChatMenuButton(botIntegrationId)
        : { type: 'commands' },
    );
  }
}
