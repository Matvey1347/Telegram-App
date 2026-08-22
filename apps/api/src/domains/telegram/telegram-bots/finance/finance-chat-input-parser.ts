/** Deterministic chat input parser: `+300 Salary` is income, `250 Store` is expense. */
export function parseFinanceQuickInput(input: string) {
  const match = input.trim().match(/^(\+)?\s*(\d+(?:[.,]\d{1,2})?)\s*(.*)$/u);
  if (!match) return null;
  return {
    type: match[1] ? ('INCOME' as const) : ('EXPENSE' as const),
    amount: match[2].replace(',', '.'),
    description: match[3].trim() || null,
  };
}

export type FinanceChatCommand =
  | 'start'
  | 'income'
  | 'expense'
  | 'recent'
  | 'accounts'
  | 'categories'
  | 'transfer'
  | 'settings'
  | 'help';

/** Browser login deep links stay below Telegram's 64-character start payload limit. */
export function parseFinanceBrowserLoginToken(input: string) {
  const match = input
    .trim()
    .match(/^\/start(?:@[^\s]+)?\s+finlogin_([A-Za-z0-9_-]{32})$/u);
  return match?.[1] || null;
}

/** Parses Telegram commands, including `/start payload` and `/start@bot`. */
export function parseFinanceChatCommand(
  input: string,
): FinanceChatCommand | null {
  const match = input
    .trim()
    .match(
      /^\/(start|income|expense|recent|accounts|categories|transfer|settings|help)(?:@[^\s]+)?(?:\s+.*)?$/iu,
    );
  return match ? (match[1].toLowerCase() as FinanceChatCommand) : null;
}

const menuCommands: Array<[FinanceChatCommand, Parameters<typeof t>[1]]> = [
  ['income', 'menuIncome'],
  ['expense', 'menuExpense'],
  ['recent', 'menuRecent'],
  ['accounts', 'menuAccounts'],
  ['categories', 'menuCategories'],
  ['transfer', 'menuTransfer'],
  ['settings', 'menuSettings'],
  ['help', 'menuHelp'],
];

/** Accepts a persisted reply-keyboard button from any supported language. */
export function parseFinanceMenuText(
  input: string,
): FinanceChatCommand | 'open' | null {
  for (const locale of FINANCE_CHAT_LOCALES) {
    if (input === t(locale, 'menuOpen')) return 'open';
    const command = menuCommands.find(([, key]) => input === t(locale, key));
    if (command) return command[0];
  }
  return null;
}
import {
  FINANCE_CHAT_LOCALES,
  t,
} from '../../consumer-finance/i18n/finance-chat-i18n';
