export type TelegramReplyKeyboardButton = {
  text: string;
  webAppUrl?: string;
};

export type TelegramReplyKeyboardMarkup = {
  keyboard: Array<Array<{ text: string; web_app?: { url: string } }>>;
  resize_keyboard: true;
  one_time_keyboard: false;
  input_field_placeholder?: string;
};

/**
 * Reply keyboards remain available until users explicitly collapse them with
 * Telegram's native control. Omitting `is_persistent` is deliberate: Telegram
 * defaults it to false, which preserves that control.
 */
export function createCollapsibleReplyKeyboard(
  buttons: Array<Array<TelegramReplyKeyboardButton>>,
  options?: { inputFieldPlaceholder?: string },
): TelegramReplyKeyboardMarkup {
  return {
    keyboard: buttons.map((row) =>
      row.map((button) => ({
        text: button.text,
        ...(button.webAppUrl ? { web_app: { url: button.webAppUrl } } : {}),
      })),
    ),
    resize_keyboard: true,
    one_time_keyboard: false,
    ...(options?.inputFieldPlaceholder
      ? { input_field_placeholder: options.inputFieldPlaceholder }
      : {}),
  };
}
