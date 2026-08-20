import { TelegramBotApiClient } from '../../../../telegram/shared/telegram-bot-api.client';

/** Interaction feedback is best effort and must never interrupt financial work. */
export async function acknowledgeFinanceCallback(
  botApi: TelegramBotApiClient,
  token: string,
  callbackQueryId: string,
  text: string,
) {
  try {
    await botApi.answerCallbackQuery(token, {
      callback_query_id: callbackQueryId,
      text,
    });
  } catch {
    // Telegram acknowledgement failures are safe to ignore.
  }
}

export async function sendFinanceTyping(
  botApi: TelegramBotApiClient,
  token: string,
  chatId: string,
) {
  try {
    await botApi.sendChatAction(token, chatId, 'typing');
  } catch {
    // Typing feedback is optional.
  }
}
