import { Injectable } from '@nestjs/common';
import type { TelegramBotApplicationContext } from '@api/domains/telegram/telegram-bots/core/telegram-bot-update.types';
import { TelegramBotInteractiveReplyService } from '@api/telegram/shared/bot/telegram-bot-interactive-reply.service';
import { FinanceConsumerTransferService } from '@finance-pro/api/identity/finance-consumer-transfer.service';
import { parseFinanceBrowserLoginToken } from '@finance-pro/bot/finance-chat-input-parser';
import {
  type FinanceChatLocale,
  t,
} from '@finance-pro/api/i18n/finance-chat-i18n';

@Injectable()
export class FinanceBotBrowserLogin {
  constructor(
    private readonly transfers: FinanceConsumerTransferService,
    private readonly interactive: TelegramBotInteractiveReplyService,
  ) {}

  async handle(
    context: TelegramBotApplicationContext,
    chatId: string,
    profileId: string,
    locale: FinanceChatLocale,
  ) {
    const token = parseFinanceBrowserLoginToken(
      context.update.message?.text || '',
    );
    if (!token) return false;
    const approved = await this.transfers.approveBrowserLogin({
      token,
      botIntegrationId: context.bot.id,
      profileId,
    });
    await this.interactive.send(context.token, chatId, {
      text: t(
        locale,
        approved ? 'browserLoginApproved' : 'browserLoginExpired',
      ),
    });
    return true;
  }
}
