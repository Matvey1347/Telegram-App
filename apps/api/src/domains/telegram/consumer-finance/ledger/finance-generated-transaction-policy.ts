import { ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../../prisma/prisma.service';

type GeneratedTransactionLinks = {
  debtSettlement: { id: string } | null;
  recurringPaymentOccurrence: { id: string } | null;
  investmentCashFlow: { id: string } | null;
};

export function assertFinanceTransactionMutable(
  transaction: GeneratedTransactionLinks,
) {
  if (
    transaction.debtSettlement ||
    transaction.recurringPaymentOccurrence ||
    transaction.investmentCashFlow
  )
    throw new ConflictException(
      'Generated finance transactions must be changed through their source record',
    );
}

export async function assertFinanceTransactionRemoved(
  prisma: PrismaService,
  profileId: string,
  id: string,
  removedCount: number,
) {
  if (removedCount) return;
  const transaction = await prisma.financeTransaction.findFirst({
    where: { id, profileId, deletedAt: null },
    select: {
      debtSettlement: { select: { id: true } },
      recurringPaymentOccurrence: { select: { id: true } },
      investmentCashFlow: { select: { id: true } },
    },
  });
  if (transaction) assertFinanceTransactionMutable(transaction);
  throw new NotFoundException('Finance transaction not found');
}
