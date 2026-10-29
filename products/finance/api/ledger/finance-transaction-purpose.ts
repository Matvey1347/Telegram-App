import { BadRequestException } from '@nestjs/common';
import { FinanceTransactionPurpose } from '@prisma/client';
import type { CreateFinanceTransactionDto } from '@consumer-finance/api/http/finance.dto';

export function assertFinancePurposeDirection(
  purpose: FinanceTransactionPurpose,
  type: CreateFinanceTransactionDto['type'],
  categoryId?: string,
) {
  const expectedType =
    purpose === FinanceTransactionPurpose.REIMBURSEMENT ||
    purpose === FinanceTransactionPurpose.PASS_THROUGH ||
    purpose === FinanceTransactionPurpose.INVESTMENT_RETURN
      ? 'INCOME'
      : purpose === FinanceTransactionPurpose.DEBT_REPAYMENT ||
          purpose === FinanceTransactionPurpose.INVESTMENT_CONTRIBUTION
        ? 'EXPENSE'
        : type;
  if (type !== expectedType)
    throw new BadRequestException(
      'Transaction purpose does not match transaction type',
    );
  if (purpose !== FinanceTransactionPurpose.ORDINARY && categoryId)
    throw new BadRequestException(
      'Balance-only transactions cannot use an income or expense category',
    );
}
