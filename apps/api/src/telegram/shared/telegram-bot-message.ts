import { createCollapsibleReplyKeyboard } from './telegram-reply-keyboard';

export type TelegramBotMessage = {
  text: string;
  parseMode?: string;
  removeReplyKeyboard?: boolean;
  removeInlineKeyboard?: boolean;
  inlineButtons?: Array<
    Array<{
      text: string;
      url?: string;
      webAppUrl?: string;
      callbackData?: string;
      iconCustomEmojiId?: string;
    }>
  >;
  replyKeyboard?: Array<Array<{ text: string; webAppUrl?: string }>>;
};

/** One formatter for both durable and immediate Bot API message delivery. */
export function telegramBotMessagePayload(
  chatId: string,
  message: TelegramBotMessage,
) {
  return {
    chat_id: chatId,
    text: message.text,
    parse_mode: message.parseMode,
    reply_markup: message.removeReplyKeyboard
      ? { remove_keyboard: true }
      : message.removeInlineKeyboard
        ? { inline_keyboard: [] }
        : message.inlineButtons?.length
          ? {
              inline_keyboard: message.inlineButtons.map((row) =>
                row.map((button) => ({
                  text: button.text,
                  ...(button.url ? { url: button.url } : {}),
                  ...(button.webAppUrl
                    ? { web_app: { url: button.webAppUrl } }
                    : {}),
                  ...(button.callbackData
                    ? { callback_data: button.callbackData }
                    : {}),
                  ...(button.iconCustomEmojiId
                    ? { icon_custom_emoji_id: button.iconCustomEmojiId }
                    : {}),
                })),
              ),
            }
          : message.replyKeyboard?.length
            ? createCollapsibleReplyKeyboard(message.replyKeyboard)
            : undefined,
  };
}
