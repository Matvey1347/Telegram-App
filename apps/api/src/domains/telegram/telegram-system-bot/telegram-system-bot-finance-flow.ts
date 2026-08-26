type Choice = { text: string; callback_data: string };
type AccountChoice = {
  id: string;
  name: string;
  currency: string;
  emoji?: string;
};

export type TelegramSystemBotFinanceResult = (
  | { kind: 'ACCOUNT'; text: string; buttons: Choice[] }
  | { kind: 'CATEGORY'; text: string; buttons: Choice[] }
  | { kind: 'TRANSFER_FROM'; text: string; buttons: Choice[] }
  | { kind: 'TRANSFER_TO'; text: string; buttons: Choice[] }
  | { kind: 'INPUT'; text: string; draftId: string }
  | { kind: 'CONFIRM'; text: string; callbackData: string }
  | {
      kind: 'COMPLETED';
      operation: 'transaction' | 'transfer';
      id: string;
    }
  | { kind: 'DUPLICATE' }
  | { kind: 'CANCELLED' }
  | { kind: 'UNAVAILABLE' }
) & { controlMessageId?: number | null };

export function financeAccountChoice(
  draftId: string,
  accounts: AccountChoice[],
): TelegramSystemBotFinanceResult {
  return {
    kind: 'ACCOUNT',
    text: 'Choose account:',
    buttons: accounts.map((account, index) => ({
      text: `${account.emoji ?? '💳'} ${account.name} · ${account.currency}`,
      callback_data: `finance:account:${draftId}:${index}`,
    })),
  };
}

export function financeTransferAccountChoice(
  draftId: string,
  accounts: AccountChoice[],
  direction: 'from' | 'to',
  excludedId?: string,
): TelegramSystemBotFinanceResult {
  const available = accounts.filter((account) => account.id !== excludedId);
  return {
    kind: direction === 'from' ? 'TRANSFER_FROM' : 'TRANSFER_TO',
    text:
      direction === 'from' ? 'Transfer from account:' : 'Transfer to account:',
    buttons: available.map((account, index) => ({
      text: `${account.emoji ?? '💳'} ${account.name} · ${account.currency}`,
      callback_data: `finance:${direction}:${draftId}:${index}`,
    })),
  };
}

export function financeCategoryChoice(
  draftId: string,
  categories: Array<{ id: string; name: string; emoji?: string }>,
): TelegramSystemBotFinanceResult {
  return {
    kind: 'CATEGORY',
    text: 'Choose category:',
    buttons: categories.map((category, index) => ({
      text: `${category.emoji ?? '🏷️'} ${category.name}`,
      callback_data: `finance:category:${draftId}:${index}`,
    })),
  };
}

export function parseFinanceTransactionInput(text: string) {
  const match = /^\s*(\d+(?:[.,]\d{1,2})?)(?:\s+(.+))?\s*$/.exec(text);
  const amount = match ? Number(match[1].replace(',', '.')) : 0;
  return match && amount > 0 ? { amount, description: match[2] } : null;
}

export function parseFinanceTransferInput(text: string, sameCurrency: boolean) {
  const pattern = sameCurrency
    ? /^\s*(\d+(?:[.,]\d{1,2})?)(?:\s+(.+))?\s*$/
    : /^\s*(\d+(?:[.,]\d{1,2})?)\s+(?:[A-Za-z]{3}\s+)?(\d+(?:[.,]\d{1,2})?)(?:\s+[A-Za-z]{3})?(?:\s+(.+))?\s*$/;
  const match = pattern.exec(text);
  if (!match) return null;
  const fromAmount = Number(match[1].replace(',', '.'));
  const toAmount = sameCurrency
    ? fromAmount
    : Number(match[2].replace(',', '.'));
  const description = sameCurrency ? match[2] : match[3];
  return fromAmount > 0 && toAmount > 0
    ? { fromAmount, toAmount, description }
    : null;
}
