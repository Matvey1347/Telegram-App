import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrencyConversionService } from '../../../../common/currency-conversion.service';
import { PrismaService } from '../../../../prisma/prisma.service';

/** Builds one authoritative account response in constant query count. */
export async function financeAccountView(
  prisma: PrismaService,
  conversionService: CurrencyConversionService | undefined,
  profileId: string,
  accountId: string,
) {
  const [account, transactions, outgoing, incoming, profile] =
    await Promise.all([
      prisma.financeAccount.findFirst({
        where: { id: accountId, profileId },
        select: {
          id: true,
          name: true,
          type: true,
          currency: true,
          openingBalance: true,
          archivedAt: true,
        },
      }),
      prisma.financeTransaction.groupBy({
        by: ['type'],
        where: { profileId, accountId, deletedAt: null },
        _sum: { amount: true },
      }),
      prisma.financeTransfer.aggregate({
        where: { profileId, fromAccountId: accountId, deletedAt: null },
        _sum: { fromAmount: true },
      }),
      prisma.financeTransfer.aggregate({
        where: { profileId, toAccountId: accountId, deletedAt: null },
        _sum: { toAmount: true },
      }),
      prisma.financeProfile.findUnique({
        where: { id: profileId },
        select: {
          defaultCurrency: true,
          botIntegration: { select: { workspaceId: true } },
        },
      }),
    ]);
  if (!account) throw new NotFoundException('Finance account not found');
  if (!profile) throw new NotFoundException('Finance profile not found');
  let balance = new Prisma.Decimal(account.openingBalance);
  for (const row of transactions)
    balance =
      row.type === 'INCOME'
        ? balance.plus(row._sum.amount || 0)
        : balance.minus(row._sum.amount || 0);
  balance = balance
    .minus(outgoing._sum.fromAmount || 0)
    .plus(incoming._sum.toAmount || 0);
  const conversion =
    conversionService && account.currency !== profile.defaultCurrency
      ? await conversionService.getRateMetadata(
          account.currency,
          profile.defaultCurrency,
          profile.botIntegration.workspaceId,
        )
      : null;
  return {
    ...account,
    openingBalance: account.openingBalance.toString(),
    balance: balance.toString(),
    defaultCurrency: profile.defaultCurrency,
    equivalentBalance: conversion?.available
      ? {
          amount: balance.mul(conversion.rate).toDecimalPlaces(2).toString(),
          currency: profile.defaultCurrency,
          rate: String(conversion.rate),
          rateAsOf: conversion.rateAt.toISOString(),
        }
      : null,
  };
}
