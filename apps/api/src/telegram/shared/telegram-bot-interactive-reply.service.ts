import { Injectable, Logger } from '@nestjs/common';
import { TelegramBotApiClient } from './telegram-bot-api.client';
import {
  telegramBotMessagePayload,
  type TelegramBotMessage,
} from './telegram-bot-message';

/**
 * Immediate replies to a live update. This deliberately has no persistence,
 * scheduler or retry semantics; durable broadcasts/reminders use the delivery service.
 */
@Injectable()
export class TelegramBotInteractiveReplyService {
  private readonly logger = new Logger(TelegramBotInteractiveReplyService.name);

  constructor(private readonly botApi: TelegramBotApiClient) {}

  async send(token: string, chatId: string, message: TelegramBotMessage) {
    const startedAt = Date.now();
    try {
      return await this.botApi.sendMessage(
        token,
        telegramBotMessagePayload(chatId, message),
      );
    } finally {
      const latencyMs = Date.now() - startedAt;
      if (latencyMs >= 750)
        this.logger.warn(
          JSON.stringify({
            event: 'telegram_bot.slow_interactive_send',
            latencyMs,
          }),
        );
    }
  }

  async edit(
    token: string,
    chatId: string,
    messageId: number,
    message: TelegramBotMessage,
  ) {
    const startedAt = Date.now();
    try {
      return await this.botApi.editMessageText(token, {
        ...telegramBotMessagePayload(chatId, message),
        message_id: messageId,
      });
    } finally {
      const latencyMs = Date.now() - startedAt;
      if (latencyMs >= 750)
        this.logger.warn(
          JSON.stringify({
            event: 'telegram_bot.slow_interactive_edit',
            latencyMs,
          }),
        );
    }
  }
}
