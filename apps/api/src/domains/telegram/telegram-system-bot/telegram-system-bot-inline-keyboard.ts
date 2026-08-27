export function compactSystemBotInlineKeyboard<T>(
  buttons: readonly T[],
  options: { columns?: 2 | 3; limit?: number } = {},
): T[][] {
  const columns = options.columns ?? 2;
  const visible = buttons.slice(0, options.limit ?? 8);
  const rows: T[][] = [];
  for (let index = 0; index < visible.length; index += columns) {
    rows.push(visible.slice(index, index + columns));
  }
  return rows;
}

export function systemBotReviewActionRow(prefix: string) {
  return telegramBotApiActionRow({
    back: `${prefix}back`,
    cancel: `${prefix}cancel`,
    confirm: `${prefix}confirm`,
  });
}
import { telegramBotApiActionRow } from '../../../telegram/shared/telegram-bot-action-buttons';
