import type {
  TelegramPostButtonRows,
  TelegramPostButtonStyle,
} from '@telegram-system/shared';

export type TelegramBotInlineKeyboard = {
  inline_keyboard: Array<
    Array<{ text: string; url: string; style?: Exclude<TelegramPostButtonStyle, 'default'> }>
  >;
};

const styles: readonly TelegramPostButtonStyle[] = [
  'default',
  'primary',
  'success',
  'danger',
];

/** Converts persisted JSON to the stable API representation; legacy null means no buttons. */
export function normalizeTelegramPostButtonRows(value: unknown): TelegramPostButtonRows {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    const rawButtons = Array.isArray(row)
      ? row
      : row && typeof row === 'object' && Array.isArray((row as { buttons?: unknown }).buttons)
        ? (row as { buttons: unknown[] }).buttons
        : [];
    const buttons = rawButtons.flatMap((button) => {
      if (!button || typeof button !== 'object') return [];
      const candidate = button as Record<string, unknown>;
      if (
        typeof candidate.text !== 'string' ||
        typeof candidate.url !== 'string' ||
        !styles.includes(candidate.style as TelegramPostButtonStyle)
      ) return [];
      return [{ text: candidate.text, url: candidate.url, style: candidate.style as TelegramPostButtonStyle }];
    });
    return buttons.length ? [buttons] : [];
  });
}

/** Bot API URL keyboard. `default` must be omitted, while supported colored styles are explicit. */
export function toTelegramBotInlineKeyboard(rows: TelegramPostButtonRows): TelegramBotInlineKeyboard | undefined {
  if (!rows.length) return undefined;
  return {
    inline_keyboard: rows.map((row) =>
      row.map(({ text, url, style }) => ({
        text,
        url,
        ...(style === 'default' ? {} : { style }),
      })),
    ),
  };
}
