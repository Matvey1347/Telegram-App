import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FinanceLedgerService } from './finance-ledger.service';

const session = {
  financeBotId: 'bot-1',
  financeTelegramUserId: 'user-1',
  profileId: 'profile-1',
  expiresAt: Date.now() + 1_000,
};

describe('FinanceLedgerService', () => {
  it('writes integer minor units and updates the account in one transaction', async () => {
    const tx = {
      financeTransaction: { create: jest.fn().mockResolvedValue({ id: 'transaction-1' }) },
      financeAccount: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      financeAccount: { findFirst: jest.fn().mockResolvedValue({ id: 'account-1' }) },
      $transaction: jest.fn(async (work) => work(tx)),
    };
    const service = new FinanceLedgerService(prisma as never);

    await expect(
      service.createTransaction(session, {
        accountId: 'account-1',
        kind: 'EXPENSE',
        amountMinor: '1999',
        economicAmountMinor: '499',
      }),
    ).resolves.toEqual({ id: 'transaction-1' });
    expect(tx.financeAccount.update).toHaveBeenCalledWith({
      where: { id: 'account-1' },
      data: { balanceMinor: { increment: -1999n } },
    });
  });

  it('rejects floats and an account from another local Finance profile', async () => {
    const prisma = { financeAccount: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new FinanceLedgerService(prisma as never);
    await expect(
      service.createTransaction(session, {
        accountId: 'account-1',
        kind: 'INCOME',
        amountMinor: '1.5',
        economicAmountMinor: '1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createTransaction(session, {
        accountId: 'other-profile-account',
        kind: 'INCOME',
        amountMinor: '100',
        economicAmountMinor: '100',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
