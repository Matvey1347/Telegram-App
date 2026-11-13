import { Prisma } from '@prisma/client';

/** Rebuild the current projection from the latest effective valuation and later cash flows. */
export async function refreshInvestmentCurrent(
  tx: Prisma.TransactionClient,
  profileId: string,
  investmentId: string,
) {
  const current = await tx.financeInvestmentValuation.findFirst({
    where: { profileId, investmentId, correctedBy: null },
    orderBy: [{ valuedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    select: { value: true, amountInValuationCurrency: true, valuedAt: true, createdAt: true },
  });
  const later = current ? { OR: [
    { occurredAt: { gt: current.valuedAt } },
    { occurredAt: current.valuedAt, createdAt: { gt: current.createdAt } },
  ] } : {};
  const where = { profileId, investmentId, ...later };
  const [flows, transactions] = await Promise.all([
    tx.financeInvestmentCashFlow.groupBy({ by: ['kind'], where, _sum: { amountInInvestmentCurrency: true } }),
    tx.financeTransaction.groupBy({
      by: ['type'], where: { profileId, deletedAt: null, investmentCashFlow: { is: where } },
      _sum: { amountInValuationCurrency: true },
    }),
  ]);
  const amount = (kind: 'CONTRIBUTION' | 'RETURN') => flows.find((row) => row.kind === kind)?._sum.amountInInvestmentCurrency ?? new Prisma.Decimal(0);
  const usd = (type: 'EXPENSE' | 'INCOME') => transactions.find((row) => row.type === type)?._sum.amountInValuationCurrency ?? new Prisma.Decimal(0);
  await tx.financeInvestment.update({
    where: { id: investmentId },
    data: {
      currentValue: new Prisma.Decimal(current?.value ?? 0).plus(amount('CONTRIBUTION')).minus(amount('RETURN')),
      currentValueInValuationCurrency: new Prisma.Decimal(current?.amountInValuationCurrency ?? 0).plus(usd('EXPENSE')).minus(usd('INCOME')),
      currentValuationAt: current?.valuedAt ?? null,
      version: { increment: 1 },
    },
  });
}
