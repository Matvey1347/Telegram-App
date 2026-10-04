import { Prisma } from '@prisma/client';

type BalanceAccount = {
  id: string;
  name: string;
  currency: string;
  balance: string;
  equivalentBalance?: { amount: string; currency: string } | null;
  archivedAt?: Date | string | null;
};

export function financeBalanceSummary(
  accounts: BalanceAccount[],
  currency: string,
) {
  let amount = new Prisma.Decimal(0);
  let includedAccountCount = 0;
  const excludedAccounts: Array<{
    accountId: string;
    name: string;
    balance: string;
    currency: string;
    reason: 'RATE_UNAVAILABLE';
  }> = [];

  for (const account of accounts) {
    if (account.archivedAt) continue;
    if (account.currency === currency) {
      amount = amount.plus(account.balance);
      includedAccountCount += 1;
      continue;
    }
    if (account.equivalentBalance?.currency === currency) {
      amount = amount.plus(account.equivalentBalance.amount);
      includedAccountCount += 1;
      continue;
    }
    excludedAccounts.push({
      accountId: account.id,
      name: account.name,
      balance: account.balance,
      currency: account.currency,
      reason: 'RATE_UNAVAILABLE',
    });
  }

  return {
    amount: amount.toDecimalPlaces(2).toString(),
    currency,
    includedAccountCount,
    excludedAccounts,
  };
}
