import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

// Keep identity, billing, sessions and assistant preferences. Only the user's
// Finance ledger/planning data and stale write flows are replaced.
export async function clearFinanceDataForReplacement(
  tx: Tx,
  profileId: string,
) {
  const where = { profileId };

  await tx.financeInvestmentValuation.updateMany({
    where,
    data: { correctsValuationId: null },
  });
  await tx.financeRecurringPaymentOccurrence.deleteMany({ where });
  await tx.financeInvestmentCashFlow.deleteMany({ where });
  await tx.financeInvestmentValuation.deleteMany({ where });
  await tx.financeSavingsMovement.deleteMany({ where });
  await tx.financeDebt.deleteMany({ where });
  await tx.financeRecurringPayment.deleteMany({ where });
  await tx.financeInvestment.deleteMany({ where });
  await tx.financeSavingsGoal.deleteMany({ where });
  await tx.financeReminder.deleteMany({ where });
  await tx.financeSpendingLimit.deleteMany({ where });
  await tx.financeTransfer.deleteMany({ where });
  await tx.financeTransaction.deleteMany({ where });
  await tx.financeMerchantMapping.deleteMany({ where });
  await tx.financeCategory.deleteMany({ where });
  await tx.financeAccount.deleteMany({ where });
  await tx.financePendingProposal.deleteMany({ where });
  await tx.financeChatFlow.deleteMany({ where });
  await tx.financeDataImportReceipt.deleteMany({ where });
}
