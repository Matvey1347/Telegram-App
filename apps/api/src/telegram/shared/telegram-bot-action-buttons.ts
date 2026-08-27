export const TELEGRAM_BOT_ACTION_TEXT = {
  back: '←',
  cancel: '❌',
  confirm: '✅',
  edit: '✏️',
  delete: '🗑️',
} as const;

type ActionCallbacks = {
  back?: string;
  cancel?: string;
  confirm?: string;
};

export function telegramBotActionRow(callbacks: ActionCallbacks) {
  return (['back', 'cancel', 'confirm'] as const).flatMap((action) =>
    callbacks[action]
      ? [
          {
            text: TELEGRAM_BOT_ACTION_TEXT[action],
            callbackData: callbacks[action],
          },
        ]
      : [],
  );
}

export function telegramBotApiActionRow(callbacks: ActionCallbacks) {
  return telegramBotActionRow(callbacks).map(({ text, callbackData }) => ({
    text,
    callback_data: callbackData,
  }));
}

export function telegramBotEditButtonText(label?: string | null) {
  const value = label?.trim();
  return value
    ? `${TELEGRAM_BOT_ACTION_TEXT.edit} ${value}`
    : TELEGRAM_BOT_ACTION_TEXT.edit;
}
