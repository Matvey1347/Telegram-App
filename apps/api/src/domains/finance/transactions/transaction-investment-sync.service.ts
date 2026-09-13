import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

type InvestmentTransaction = {
  id: string;
  workspaceId: string;
  accountId: string;
  memberId: string | null;
  amount: Prisma.Decimal;
  currency: string;
  amountInPrimaryCurrency: Prisma.Decimal;
  exchangeRateToPrimary: Prisma.Decimal;
  date: Date;
  description: string | null;
  createdByUserId: string | null;
  assignedMemberId: string | null;
};

@Injectable()
export class TransactionInvestmentSyncService {
  async syncContribution(
    tx: Prisma.TransactionClient,
    transaction: InvestmentTransaction,
  ) {
    if (!transaction.memberId) return;

    const values = {
      workspaceId: transaction.workspaceId,
      workspaceMemberId: transaction.memberId,
      accountId: transaction.accountId,
      amount: transaction.amount,
      currency: transaction.currency,
      amountInPrimaryCurrency: transaction.amountInPrimaryCurrency,
      exchangeRateToPrimary: transaction.exchangeRateToPrimary,
      date: transaction.date,
      notes: transaction.description,
      createdByUserId: transaction.createdByUserId,
      assignedMemberId: transaction.assignedMemberId,
      origin: 'EXTERNAL' as const,
      movementType: 'CONTRIBUTION' as const,
    };

    await tx.investment.upsert({
      where: { transactionId: transaction.id },
      create: { ...values, transactionId: transaction.id },
      update: values,
    });
  }

  async removeContribution(
    tx: Prisma.TransactionClient,
    transactionId: string,
  ) {
    await tx.investment.deleteMany({
      where: { transactionId, origin: 'EXTERNAL' },
    });
  }
}
