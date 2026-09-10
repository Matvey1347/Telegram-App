import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ConsumerFinanceBalanceSummary } from '@telegram-system/shared';
import { CurrencyConversionService } from '../../../../common/currency-conversion.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { financeBalanceSummary } from '../ledger/finance-balance-summary';
import { prepareFinanceAccountRates } from '../ledger/finance-transaction-valuation';
import { FinanceSavingsReadService } from '../savings/finance-savings-read.service';

@Injectable()
export class FinanceAssetSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly savings: FinanceSavingsReadService,
    private readonly conversion?: CurrencyConversionService,
  ) {}

  async overview(
    profileId: string,
    suppliedCash?: ConsumerFinanceBalanceSummary,
  ) {
    const profile = await this.prisma.financeProfile.findUnique({
      where: { id: profileId },
      select: {
        defaultCurrency: true,
        botIntegration: { select: { workspaceId: true } },
      },
    });
    if (!profile) throw new NotFoundException('Finance profile not found');
    const [savings, investmentRows, cash] = await Promise.all([
      this.savings.summary(profileId),
      this.prisma.financeInvestment.findMany({
        where: { profileId, status: { not: 'ARCHIVED' } },
        select: {
          id: true,
          name: true,
          currency: true,
          status: true,
          valuationCurrency: true,
          totalInvestedInValuationCurrency: true,
          totalReturnedInValuationCurrency: true,
          currentValueInValuationCurrency: true,
          currentValuationAt: true,
        },
      }),
      suppliedCash
        ? Promise.resolve(suppliedCash)
        : this.cashSummary(
            profileId,
            profile.defaultCurrency,
            profile.botIntegration.workspaceId,
          ),
    ]);
    let rate: Prisma.Decimal | null = new Prisma.Decimal(1);
    if (profile.defaultCurrency !== 'USD') {
      const result = this.conversion
        ? await this.conversion.getRateMetadata(
            'USD',
            profile.defaultCurrency,
            profile.botIntegration.workspaceId,
          )
        : null;
      rate = result?.available ? new Prisma.Decimal(result.rate) : null;
    }
    let invested = new Prisma.Decimal(0);
    let returned = new Prisma.Decimal(0);
    let currentValue = new Prisma.Decimal(0);
    const excludedInvestments: Array<{
      investmentId: string;
      name: string;
      currency: string;
      invested: string;
      returned: string;
      currentValue: string;
      reason: 'RATE_UNAVAILABLE' | 'VALUATION_MISSING';
    }> = [];
    for (const row of investmentRows) {
      if (row.status === 'ACTIVE' && !row.currentValuationAt) {
        excludedInvestments.push({
          investmentId: row.id,
          name: row.name,
          currency: row.currency,
          invested: row.totalInvestedInValuationCurrency.toString(),
          returned: row.totalReturnedInValuationCurrency.toString(),
          currentValue: row.currentValueInValuationCurrency.toString(),
          reason: 'VALUATION_MISSING',
        });
        continue;
      }
      if (row.valuationCurrency !== 'USD' || !rate) {
        excludedInvestments.push({
          investmentId: row.id,
          name: row.name,
          currency: row.currency,
          invested: row.totalInvestedInValuationCurrency.toString(),
          returned: row.totalReturnedInValuationCurrency.toString(),
          currentValue: row.currentValueInValuationCurrency.toString(),
          reason: 'RATE_UNAVAILABLE',
        });
        continue;
      }
      invested = invested.plus(row.totalInvestedInValuationCurrency.mul(rate));
      returned = returned.plus(row.totalReturnedInValuationCurrency.mul(rate));
      currentValue = currentValue.plus(
        row.currentValueInValuationCurrency.mul(rate),
      );
    }
    invested = invested.toDecimalPlaces(2);
    returned = returned.toDecimalPlaces(2);
    currentValue = currentValue.toDecimalPlaces(2);
    const profitLoss = currentValue.plus(returned).minus(invested);
    const investments = {
      currency: profile.defaultCurrency,
      totalInvested: invested.toString(),
      totalReturned: returned.toString(),
      currentValue: currentValue.toString(),
      profitLoss: profitLoss.toString(),
      returnPercentage: invested.isZero()
        ? null
        : Number(profitLoss.div(invested).mul(100).toDecimalPlaces(2)),
      activeInvestments: investmentRows.filter((row) => row.status === 'ACTIVE')
        .length,
      closedInvestments: investmentRows.filter((row) => row.status === 'CLOSED')
        .length,
      excludedInvestments,
    };
    const cashAmount = new Prisma.Decimal(cash.amount);
    return {
      savings,
      investments,
      netWorth: {
        amount: cashAmount.plus(currentValue).toString(),
        currency: profile.defaultCurrency,
        cashAmount: cash.amount,
        investmentValue: currentValue.toString(),
        complete:
          cash.excludedAccounts.length === 0 &&
          excludedInvestments.length === 0,
        excludedAccountCount: cash.excludedAccounts.length,
        excludedInvestmentCount: excludedInvestments.length,
      },
    };
  }

  private async cashSummary(
    profileId: string,
    defaultCurrency: string,
    workspaceId: string,
  ) {
    const [accounts, transactions, outgoing, incoming] = await Promise.all([
      this.prisma.financeAccount.findMany({
        where: { profileId, archivedAt: null },
        select: { id: true, name: true, currency: true, openingBalance: true },
      }),
      this.prisma.financeTransaction.groupBy({
        by: ['accountId', 'type'],
        where: { profileId, deletedAt: null },
        _sum: { amount: true },
      }),
      this.prisma.financeTransfer.groupBy({
        by: ['fromAccountId'],
        where: { profileId, deletedAt: null },
        _sum: { fromAmount: true },
      }),
      this.prisma.financeTransfer.groupBy({
        by: ['toAccountId'],
        where: { profileId, deletedAt: null },
        _sum: { toAmount: true },
      }),
    ]);
    const rates = await prepareFinanceAccountRates({
      conversion: this.conversion,
      workspaceId,
      currencies: accounts.map((account) => account.currency),
      defaultCurrency,
    });
    const views = accounts.map((account) => {
      let balance = new Prisma.Decimal(account.openingBalance);
      for (const row of transactions.filter(
        (item) => item.accountId === account.id,
      ))
        balance =
          row.type === 'INCOME'
            ? balance.plus(row._sum.amount || 0)
            : balance.minus(row._sum.amount || 0);
      balance = balance
        .minus(
          outgoing.find((row) => row.fromAccountId === account.id)?._sum
            .fromAmount || 0,
        )
        .plus(
          incoming.find((row) => row.toAccountId === account.id)?._sum
            .toAmount || 0,
        );
      const conversion = rates.get(account.currency);
      return {
        ...account,
        openingBalance: account.openingBalance.toString(),
        balance: balance.toString(),
        equivalentBalance:
          account.currency !== defaultCurrency && conversion?.available
            ? {
                amount: balance
                  .mul(conversion.rate)
                  .toDecimalPlaces(2)
                  .toString(),
                currency: defaultCurrency,
                rate: String(conversion.rate),
                rateAsOf: conversion.rateAt.toISOString(),
              }
            : null,
      };
    });
    return financeBalanceSummary(views, defaultCurrency);
  }
}
