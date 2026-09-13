const CENTS = 100;

export const roundMoney = (value: number) =>
  Math.round((value + Number.EPSILON) * CENTS) / CENTS;

export function salesCommission(amount: number, ratePercent: number) {
  return roundMoney(amount * (ratePercent / 100));
}

export function reinvestableProfit(input: {
  operatingTransactions: Array<{
    id: string;
    type: 'income' | 'expense' | string;
    amountInPrimaryCurrency: unknown;
    categoryKey: string;
  }>;
  commissionPayoutTransactionIds: ReadonlySet<string>;
  accruedSalesCommission: number;
}) {
  const operatingResult = input.operatingTransactions.reduce((sum, row) => {
    if (
      row.categoryKey === 'investment' ||
      row.categoryKey === 'investment_return' ||
      row.categoryKey === 'balance_adjustment' ||
      row.categoryKey === 'fixing_balance' ||
      input.commissionPayoutTransactionIds.has(row.id)
    ) {
      return sum;
    }
    const amount = Number(row.amountInPrimaryCurrency ?? 0);
    return sum + (row.type === 'income' ? amount : -amount);
  }, 0);

  // Sales salary is accrued when the customer's payment becomes active. A
  // later cash payout is excluded above, otherwise the same salary would be
  // deducted twice or assigned to whichever period the owner happened to pay.
  return roundMoney(operatingResult - input.accruedSalesCommission);
}

export function allocateProfitByCapital(
  profit: number,
  capital: Array<{ memberId: string; amount: number }>,
) {
  const investors = capital.filter((row) => row.amount > 0);
  const totalCapital = investors.reduce((sum, row) => sum + row.amount, 0);
  const profitCents = Math.round(roundMoney(profit) * CENTS);
  if (profitCents <= 0 || totalCapital <= 0) return [];

  const rows = investors.map((row) => {
    const exactCents = profitCents * (row.amount / totalCapital);
    const floorCents = Math.floor(exactCents);
    return {
      memberId: row.memberId,
      cents: floorCents,
      remainder: exactCents - floorCents,
    };
  });
  let remaining = profitCents - rows.reduce((sum, row) => sum + row.cents, 0);
  const byRemainder = [...rows].sort(
    (left, right) =>
      right.remainder - left.remainder ||
      left.memberId.localeCompare(right.memberId),
  );
  for (let index = 0; remaining > 0; index += 1, remaining -= 1) {
    byRemainder[index % byRemainder.length].cents += 1;
  }

  return rows
    .filter((row) => row.cents > 0)
    .map((row) => ({ memberId: row.memberId, amount: row.cents / CENTS }));
}
