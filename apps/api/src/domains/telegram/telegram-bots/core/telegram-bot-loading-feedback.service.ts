import { Injectable } from '@nestjs/common';
import { TelegramBotApiClient } from '../../../../telegram/shared/telegram-bot-api.client';
import type { TelegramBotApplicationContext } from './telegram-bot-update.types';

/** Best-effort native Telegram feedback shared by every runtime bot application. */
@Injectable()
export class TelegramBotLoadingFeedbackService {
  constructor(private readonly botApi: TelegramBotApiClient) {}

  async show(context: TelegramBotApplicationContext): Promise<null> {
    // Payment pre-checkout requests have a strict Telegram deadline and no chat
    // message to annotate. Join requests likewise have no conversational UI.
    if (context.update.pre_checkout_query) return null;
    const chatId =
      context.update.message?.chat?.id ??
      context.update.callback_query?.message?.chat?.id;
    if (!chatId) return null;
    try {
      await this.botApi.sendChatAction(context.token, String(chatId), 'typing');
      return null;
    } catch {
      return null;
    }
  }

  async remove(_message: null) {
    // Telegram clears the native typing action when the reply is delivered.
  }
}
