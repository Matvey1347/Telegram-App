import { ConflictException } from '@nestjs/common';
import { FinanceTransactionPurpose, Prisma } from '@prisma/client';
import type { UpdateFinanceTransactionDto } from '@consumer-finance/api/http/finance.dto';
import type { FinanceProfileContext } from '@consumer-finance/api/ledger/finance-transaction-valuation';

export type FinanceDebtOriginSyncInput = {
  transactionId: string;
  previousAmount: Prisma.Decimal;
  previousAccountId: string;
  previousDirection: 'I_OWE' | 'OWED_TO_ME';
  amount: Prisma.Decimal;
  accountId: string;
  direction: 'I_OWE' | 'OWED_TO_ME';
  name: string;
};

export async function prepareFinanceDebtOriginReplacement(
  tx: Prisma.TransactionClient,
  profile: FinanceProfileContext,
  input: FinanceDebtOriginSyncInput,
) {
  const origin = await tx.financeTransaction.findFirst({
    where: { id: input.transactionId, profileId: profile.id, deletedAt: null },
    select: {
      id: true,
      accountId: true,
      categoryId: true,
      merchantDisplay: true,
      type: true,
      purpose: true,
      amount: true,
      occurredAt: true,
      originatedDebts: { select: { id: true }, take: 2 },
    },
  });
  if (!origin) throw new ConflictException('Linked debt transaction is missing');
  if (origin.purpose === FinanceTransactionPurpose.ORDINARY) {
    if (!input.amount.equals(input.previousAmount) || input.accountId !== input.previousAccountId || input.direction !== input.previousDirection)
      throw new ConflictException('Shared expense allocation must be changed through the shared expense');
    return null;
  }
  if (
    (origin.purpose !== FinanceTransactionPurpose.PASS_THROUGH && origin.purpose !== FinanceTransactionPurpose.DEBT_REPAYMENT) ||
    origin.originatedDebts.length !== 1
  ) throw new ConflictException('Debt transaction linkage is inconsistent');
  const purpose = input.direction === 'I_OWE'
    ? FinanceTransactionPurpose.PASS_THROUGH
    : FinanceTransactionPurpose.DEBT_REPAYMENT;
  const dto = {
    accountId: input.accountId,
    type: input.direction === 'I_OWE' ? 'INCOME' : 'EXPENSE',
    categoryId: undefined,
    amount: input.amount.toString(),
    economicAmount: '0',
    description: input.name,
    occurredAt: origin.occurredAt.toISOString(),
    purpose,
  } as UpdateFinanceTransactionDto;
  return { origin, dto, purpose };
}
