import { Injectable } from '@nestjs/common';
import { TelegramBotApiClient } from '../../../../telegram/shared/telegram-bot-api.client';
import type { TelegramBotApplicationContext } from './telegram-bot-update.types';

type LoadingMessage = { token: string; chatId: string; messageId: number };

/** Best-effort, temporary feedback shared by every runtime bot application. */
@Injectable()
export class TelegramBotLoadingFeedbackService {
  constructor(private readonly botApi: TelegramBotApiClient) {}

  async show(
    context: TelegramBotApplicationContext,
  ): Promise<LoadingMessage | null> {
    // Payment pre-checkout requests have a strict Telegram deadline and no chat
    // message to annotate. Join requests likewise have no conversational UI.
    if (context.update.pre_checkout_query) return null;
    const chatId =
      context.update.message?.chat?.id ??
      context.update.callback_query?.message?.chat?.id;
    if (!chatId) return null;
    try {
      const message = await this.botApi.sendMessage(context.token, {
        chat_id: String(chatId),
        text: '⏳ Loading…',
      });
      return message?.message_id
        ? {
            token: context.token,
            chatId: String(chatId),
            messageId: message.message_id,
          }
        : null;
    } catch {
      return null;
    }
  }

  async remove(message: LoadingMessage | null) {
    if (!message) return;
    try {
      await this.botApi.deleteMessage(message.token, {
        chat_id: message.chatId,
        message_id: message.messageId,
      });
    } catch {
      // Feedback must never make a bot action fail.
    }
  }
}
