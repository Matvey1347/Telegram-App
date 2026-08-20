import { FinanceProposalService } from './finance-proposal.service';

describe('FinanceProposalService confirmation atomicity', () => {
  const input = {
    token: 'proposal-token',
    botIntegrationId: 'bot-1',
    telegramBotUserId: 'telegram-user-1',
    profile: { id: 'profile-1', defaultCurrency: 'USD' },
  };

  function pendingProposal() {
    return {
      id: 'proposal-1',
      botIntegrationId: input.botIntegrationId,
      telegramBotUserId: input.telegramBotUserId,
      profileId: input.profile.id,
      status: 'PENDING',
      transactionId: null,
      expiresAt: new Date(Date.now() + 60_000),
      payload: {
        operations: [
          {
            type: 'EXPENSE',
            amount: '10',
            currency: 'USD',
            description: 'first',
            accountId: 'account-1',
            categoryId: null,
            occurredAt: '2026-01-01T00:00:00.000Z',
          },
          {
            type: 'EXPENSE',
            amount: '20',
            currency: 'USD',
            description: 'second',
            accountId: 'account-1',
            categoryId: null,
            occurredAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        source: 'AI',
      },
    };
  }

  it('keeps the claim and every ledger write in one transaction on a partial failure', async () => {
    const tx: any = {
      financePendingProposal: {
        findUnique: jest.fn().mockResolvedValue(pendingProposal()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
      },
    };
    const prisma: any = { $transaction: jest.fn((callback) => callback(tx)) };
    const ledger = {
      createTransactionInTransaction: jest
        .fn()
        .mockResolvedValueOnce({ id: 'transaction-1' })
        .mockRejectedValueOnce(new Error('second write failed')),
    };

    await expect(
      new FinanceProposalService(prisma, ledger as any).confirm(input),
    ).rejects.toThrow('second write failed');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(ledger.createTransactionInTransaction).toHaveBeenNthCalledWith(
      1,
      tx,
      input.profile,
      expect.objectContaining({ amount: '10' }),
      'AI',
    );
    expect(ledger.createTransactionInTransaction).toHaveBeenNthCalledWith(
      2,
      tx,
      input.profile,
      expect.objectContaining({ amount: '20' }),
      'AI',
    );
    expect(tx.financePendingProposal.update).not.toHaveBeenCalled();
  });

  it('returns the completed proposal idempotently without additional ledger writes', async () => {
    const tx: any = {
      financePendingProposal: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            ...pendingProposal(),
            status: 'CONFIRMED',
            transactionId: 'transaction-1,transaction-2',
          }),
      },
    };
    const prisma: any = { $transaction: jest.fn((callback) => callback(tx)) };
    const ledger = { createTransactionInTransaction: jest.fn() };

    await expect(
      new FinanceProposalService(prisma, ledger as any).confirm(input),
    ).resolves.toEqual({
      transactionId: 'transaction-1,transaction-2',
      transactionIds: ['transaction-1', 'transaction-2'],
      duplicate: true,
    });
    expect(ledger.createTransactionInTransaction).not.toHaveBeenCalled();
  });
});
