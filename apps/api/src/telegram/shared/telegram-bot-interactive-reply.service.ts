import { Injectable } from '@nestjs/common';
import { TelegramBotApiClient } from './telegram-bot-api.client';
import { telegramBotMessagePayload, type TelegramBotMessage } from './telegram-bot-message';

/**
 * Immediate replies to a live update. This deliberately has no persistence,
 * scheduler or retry semantics; durable broadcasts/reminders use the delivery service.
 */
@Injectable()
export class TelegramBotInteractiveReplyService {
  constructor(private readonly botApi: TelegramBotApiClient) {}

  send(token: string, chatId: string, message: TelegramBotMessage) {
    return this.botApi.sendMessage(token, telegramBotMessagePayload(chatId, message));
  }
}
