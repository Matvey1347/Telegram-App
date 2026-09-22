import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../../prisma/prisma.service';

type InvestmentLink = {
  id: string;
  investmentId: string;
  kind: 'CONTRIBUTION' | 'RETURN';
  amountInInvestmentCurrency: Prisma.Decimal;
  exchangeRateToInvestment: Prisma.Decimal;
};

export type LinkedInvestmentTransaction = {
  id: string;
  profileId: string;
  accountId: string;
  categoryId: string | null;
  merchantDisplay: string | null;
  currency: string;
  occurredAt: Date;
  amountInValuationCurrency: Prisma.Decimal | null;
  investmentCashFlow: InvestmentLink | null;
};

export function findLinkedInvestmentTransaction(
  prisma: PrismaService,
  profileId: string,
  id: string,
) {
  return prisma.financeTransaction.findFirst({
    where: { id, profileId, deletedAt: null, investmentCashFlow: { isNot: null } },
    select: {
      id: true,
      profileId: true,
      accountId: true,
      categoryId: true,
      merchantDisplay: true,
      currency: true,
      occurredAt: true,
      amountInValuationCurrency: true,
      investmentCashFlow: {
        select: {
          id: true,
          investmentId: true,
          kind: true,
          amountInInvestmentCurrency: true,
          exchangeRateToInvestment: true,
        },
      },
    },
  });
}

export async function lockLinkedInvestment(
  tx: Prisma.TransactionClient,
  profileId: string,
  investmentId: string,
) {
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${profileId}:${investmentId}`}, 0))`,
  );
}

export async function refreshLinkedInvestmentTransaction(
  tx: Prisma.TransactionClient,
  existing: LinkedInvestmentTransaction,
): Promise<LinkedInvestmentTransaction> {
  const current = await tx.financeTransaction.findFirst({
    where: {
      id: existing.id,
      profileId: existing.profileId,
      deletedAt: null,
      investmentCashFlow: { is: { investmentId: existing.investmentCashFlow?.investmentId } },
    },
    select: {
      id: true,
      profileId: true,
      accountId: true,
      categoryId: true,
      merchantDisplay: true,
      currency: true,
      occurredAt: true,
      amountInValuationCurrency: true,
      investmentCashFlow: {
        select: {
          id: true,
          investmentId: true,
          kind: true,
          amountInInvestmentCurrency: true,
          exchangeRateToInvestment: true,
        },
      },
    },
  });
  if (!current?.investmentCashFlow)
    throw new NotFoundException('Investment transaction not found');
  return current;
}

export async function syncLinkedInvestmentEdit(
  tx: Prisma.TransactionClient,
  existing: LinkedInvestmentTransaction,
  updated: {
    amount: string;
    currency: string;
    accountId: string;
    occurredAt: Date | string;
    description?: string | null;
    valuationSnapshot?: { amount: string } | null;
  },
) {
  const link = existing.investmentCashFlow;
  if (!link) throw new NotFoundException('Investment cash flow not found');
  const investment = await tx.financeInvestment.findFirst({
    where: { id: link.investmentId, profileId: existing.profileId },
    select: { startedAt: true, closedAt: true, status: true, currency: true },
  });
  if (!investment || investment.status === 'ARCHIVED')
    throw new ConflictException('Investment is unavailable');
  const occurredAt = new Date(updated.occurredAt);
  if (occurredAt < investment.startedAt ||
      (investment.closedAt && occurredAt > investment.closedAt))
    throw new BadRequestException('Cash flow date is outside the investment period');
  if (updated.currency !== existing.currency)
    throw new BadRequestException('Choose an account in the original currency');
  if (investment.currency !== existing.currency && occurredAt.getTime() !== existing.occurredAt.getTime())
    throw new BadRequestException('The date of a converted investment cash flow cannot be changed here');
  const amount = new Prisma.Decimal(updated.amount);
  const base = amount.mul(link.exchangeRateToInvestment).toDecimalPlaces(8);
  const usd = new Prisma.Decimal(updated.valuationSnapshot?.amount || '0');
  const baseDelta = base.minus(link.amountInInvestmentCurrency);
  const usdDelta = usd.minus(existing.amountInValuationCurrency || 0);
  await tx.financeInvestmentCashFlow.update({
    where: { id: link.id },
    data: {
      accountId: updated.accountId,
      occurredAt,
      note: updated.description || null,
      amountInInvestmentCurrency: base,
    },
  });
  await tx.financeInvestment.update({
    where: { id: link.investmentId },
    data: {
      ...(link.kind === 'CONTRIBUTION'
        ? {
            totalInvested: { increment: baseDelta },
            totalInvestedInValuationCurrency: { increment: usdDelta },
          }
        : {
            totalReturned: { increment: baseDelta },
            totalReturnedInValuationCurrency: { increment: usdDelta },
          }),
      version: { increment: 1 },
    },
  });
}

export async function removeLinkedInvestmentTransaction(
  tx: Prisma.TransactionClient,
  existing: LinkedInvestmentTransaction,
) {
  const link = existing.investmentCashFlow;
  if (!link) throw new NotFoundException('Investment cash flow not found');
  await lockLinkedInvestment(tx, existing.profileId, link.investmentId);
  const current = await refreshLinkedInvestmentTransaction(tx, existing);
  const currentLink = current.investmentCashFlow!;
  await tx.financeInvestmentCashFlow.delete({ where: { id: currentLink.id } });
  await tx.financeTransaction.update({
    where: { id: current.id },
    data: { deletedAt: new Date() },
  });
  const usd = current.amountInValuationCurrency || new Prisma.Decimal(0);
  await tx.financeInvestment.update({
    where: { id: currentLink.investmentId },
    data: {
      ...(currentLink.kind === 'CONTRIBUTION'
        ? {
            totalInvested: { decrement: currentLink.amountInInvestmentCurrency },
            totalInvestedInValuationCurrency: { decrement: usd },
          }
        : {
            totalReturned: { decrement: currentLink.amountInInvestmentCurrency },
            totalReturnedInValuationCurrency: { decrement: usd },
          }),
      version: { increment: 1 },
    },
  });
  return { deleted: true, undoable: false };
}
