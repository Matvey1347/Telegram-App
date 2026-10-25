const BALANCE_ONLY = new Set([
  'PASS_THROUGH',
  'DEBT_REPAYMENT',
  'REIMBURSEMENT',
  'INVESTMENT_CONTRIBUTION',
  'INVESTMENT_RETURN',
]);

export function economicAmount(transaction) {
  if (transaction.economicAmount != null) return Math.max(0, Number(transaction.economicAmount) || 0);
  return BALANCE_ONLY.has(transaction.purpose) ? 0 : Math.max(0, Number(transaction.amount) || 0);
}

export function analyticsAmount(transaction, grouping) {
  return grouping === 'incomeSource' || grouping === 'commitments'
    ? Math.max(0, Number(transaction.amount) || 0)
    : economicAmount(transaction);
}

export function analyticsRows(transactions, type, grouping, range) {
  return transactions.filter((transaction) => {
    if (range && (transaction.date < range.from || transaction.date > range.to)) return false;
    if (type === 'delta') return (transaction.type === 'income' || transaction.type === 'expense') && economicAmount(transaction) > 0;
    return transaction.type === type && analyticsAmount(transaction, grouping) > 0;
  });
}

export function analyticsDescriptor(transaction, grouping, account, category, t) {
  const currentAccount = account(transaction.accountId || transaction.fromId);
  const currentCategory = category(transaction.categoryId);
  if (grouping === 'account')
    return { key: currentAccount?.id || 'unknown', name: currentAccount?.name || t('Без рахунку','No account'), emoji: currentAccount?.emoji || '💳' };
  if (grouping === 'necessity') {
    const kind = transaction.necessity || currentCategory?.necessity || 'optional';
    const names = { essential: t('Обов’язкові','Essential'), desired: t('Бажані','Desired'), optional: t('Інші','Other') };
    return { key: kind, name: names[kind] || names.optional, emoji: kind === 'essential' ? '🛡️' : kind === 'desired' ? '💚' : '✨' };
  }
  if (grouping === 'regularity') {
    const recurring = Boolean(transaction.recurringId);
    return { key: recurring ? 'regular' : 'oneoff', name: recurring ? t('Регулярні','Recurring') : t('Разові','One-off'), emoji: recurring ? '🔁' : '🧾' };
  }
  if (grouping === 'incomeSource') {
    if (transaction.purpose === 'PASS_THROUGH') return { key: 'borrowed', name: t('Взято в борг','Borrowed'), emoji: '🤝' };
    if (transaction.purpose === 'REIMBURSEMENT') return { key: 'returned', name: t('Повернення боргів','Debt repayments received'), emoji: '↩️' };
    if (transaction.purpose === 'INVESTMENT_RETURN') return { key: 'investmentReturn', name: t('Повернення інвестицій','Investment returns'), emoji: '📈' };
    return { key: 'earned', name: t('Власні доходи','Earned income'), emoji: '💰' };
  }
  if (grouping === 'commitments') {
    if (transaction.purpose === 'INVESTMENT_CONTRIBUTION') return { key: 'invested', name: t('Вкладено в інвестиції','Invested'), emoji: '📈' };
    if (transaction.purpose === 'DEBT_REPAYMENT') return { key: 'debtOutflow', name: t('Видано або погашено борги','Debt paid or lent'), emoji: '🤝' };
    if (transaction.recurringId) return { key: 'regular', name: t('Регулярні платежі','Recurring payments'), emoji: '🔁' };
    return { key: 'other', name: t('Інші платежі','Other payments'), emoji: '🧾' };
  }
  return { key: currentCategory?.id || 'unknown', name: currentCategory?.name || t('Інше','Other'), emoji: currentCategory?.emoji || '✨' };
}
