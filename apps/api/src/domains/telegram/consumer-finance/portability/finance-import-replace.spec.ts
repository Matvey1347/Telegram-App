import { clearFinanceDataForReplacement } from './finance-import-replace';

function model() {
  return { updateMany: jest.fn(), deleteMany: jest.fn() };
}

describe('clearFinanceDataForReplacement', () => {
  it('clears only profile-scoped ledger and planning data in dependency order', async () => {
    const tx = {
      financeInvestmentValuation: model(),
      financeRecurringPaymentOccurrence: model(),
      financeInvestmentCashFlow: model(),
      financeSavingsMovement: model(),
      financeDebt: model(),
      financeRecurringPayment: model(),
      financeInvestment: model(),
      financeSavingsGoal: model(),
      financeReminder: model(),
      financeSpendingLimit: model(),
      financeTransfer: model(),
      financeTransaction: model(),
      financeMerchantMapping: model(),
      financeCategory: model(),
      financeAccount: model(),
      financePendingProposal: model(),
      financeChatFlow: model(),
      financeDataImportReceipt: model(),
    };

    await clearFinanceDataForReplacement(tx as never, 'profile-1');

    expect(tx.financeInvestmentValuation.updateMany).toHaveBeenCalledWith({
      where: { profileId: 'profile-1' },
      data: { correctsValuationId: null },
    });
    for (const value of Object.values(tx)) {
      if (
        'deleteMany' in value &&
        value.deleteMany !== tx.financeInvestmentValuation.deleteMany
      ) {
        expect(value.deleteMany).toHaveBeenCalledWith({
          where: { profileId: 'profile-1' },
        });
      }
    }
    expect(tx.financeInvestmentValuation.deleteMany).toHaveBeenCalledWith({
      where: { profileId: 'profile-1' },
    });
  });
});
