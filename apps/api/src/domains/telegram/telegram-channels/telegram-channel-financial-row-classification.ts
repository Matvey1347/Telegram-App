export type ChannelFinancialClassifiableTransaction = {
  id: string;
  type: string;
  categoryRef: { key: string | null; name: string } | null;
  telegramAdSalePayment: { id: string } | null;
};

function normalizedCategoryName(
  transaction: ChannelFinancialClassifiableTransaction,
) {
  return transaction.categoryRef?.name.trim().toLowerCase() ?? '';
}

export function isChannelPurchaseTransaction(
  transaction: ChannelFinancialClassifiableTransaction,
  purchaseTransactionId?: string | null,
) {
  const name = normalizedCategoryName(transaction);
  return (
    transaction.type === 'expense' &&
    (transaction.id === purchaseTransactionId ||
      transaction.categoryRef?.key === 'buy_channels' ||
      name === 'buy channels' ||
      name === 'buy channels (legacy)')
  );
}

export function isChannelAdvertisingExpenseTransaction(
  transaction: ChannelFinancialClassifiableTransaction,
) {
  return (
    transaction.type === 'expense' &&
    (transaction.categoryRef?.key === 'advertising' ||
      normalizedCategoryName(transaction) === 'advertising')
  );
}

export function isChannelAdvertisingRevenueTransaction(
  transaction: ChannelFinancialClassifiableTransaction,
) {
  return (
    transaction.type === 'income' &&
    !transaction.telegramAdSalePayment &&
    (transaction.categoryRef?.key === 'channel_advertising_revenue' ||
      normalizedCategoryName(transaction) === 'channel advertising revenue')
  );
}
