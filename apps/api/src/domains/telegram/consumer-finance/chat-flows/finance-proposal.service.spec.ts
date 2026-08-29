import { Prisma } from '@prisma/client';
import { FinanceLedgerService } from '../ledger/finance-ledger.service';
import { FinanceProposalService } from './finance-proposal.service';

describe('FinanceProposalService confirmation atomicity', () => {
  const input = {
    token: 'proposal-token',
    botIntegrationId: 'bot-1',
    telegramBotUserId: 'telegram-user-1',
    profile: {
      id: 'profile-1',
      defaultCurrency: 'USD',
      workspaceId: 'workspace-1',
    },
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
    const prisma: any = {
      financePendingProposal: {
        findUnique: jest.fn().mockResolvedValue(pendingProposal()),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const rates = { source: 'prepared' };
    const writeContext = { rates };
    const ledger = {
      prepareTransactionRateSource: jest.fn().mockResolvedValue(rates),
      prepareTransactionWriteContext: jest.fn().mockResolvedValue(writeContext),
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
      undefined,
      writeContext,
    );
    expect(ledger.createTransactionInTransaction).toHaveBeenNthCalledWith(
      2,
      tx,
      input.profile,
      expect.objectContaining({ amount: '20' }),
      'AI',
      undefined,
      writeContext,
    );
    expect(tx.financePendingProposal.update).not.toHaveBeenCalled();
  });

  it('returns the completed proposal idempotently without additional ledger writes', async () => {
    const tx: any = {
      financePendingProposal: {
        findUnique: jest.fn().mockResolvedValue({
          ...pendingProposal(),
          status: 'CONFIRMED',
          transactionId: 'transaction-1,transaction-2',
        }),
      },
    };
    const completed = {
      ...pendingProposal(),
      status: 'CONFIRMED',
      transactionId: 'transaction-1,transaction-2',
    };
    const prisma: any = {
      financePendingProposal: {
        findUnique: jest.fn().mockResolvedValue(completed),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const ledger = {
      prepareTransactionRateSource: jest.fn(),
      prepareTransactionWriteContext: jest.fn(),
      createTransactionInTransaction: jest.fn(),
    };

    await expect(
      new FinanceProposalService(prisma, ledger as any).confirm(input),
    ).resolves.toEqual({
      transactionId: 'transaction-1,transaction-2',
      transactionIds: ['transaction-1', 'transaction-2'],
      duplicate: true,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(ledger.prepareTransactionRateSource).not.toHaveBeenCalled();
    expect(ledger.prepareTransactionWriteContext).not.toHaveBeenCalled();
    expect(ledger.createTransactionInTransaction).not.toHaveBeenCalled();
  });

  it.each([1, 10])(
    'uses one prepared rate graph and batched references for %i operation(s)',
    async (operationCount) => {
      const occurredAt = '2099-01-01T00:00:00.000Z';
      const proposal = {
        ...pendingProposal(),
        payload: {
          operations: Array.from({ length: operationCount }, (_, index) => ({
            type: 'EXPENSE' as const,
            amount: String(index + 1),
            currency: 'EUR',
            description: null,
            accountId: 'account-1',
            categoryId: 'category-1',
            occurredAt,
          })),
          source: 'AI' as const,
        },
      };
      let insideTransaction = false;
      let rootCallsInsideTransaction = 0;
      const rootProposalRead = jest.fn(async () => {
        if (insideTransaction) rootCallsInsideTransaction += 1;
        return proposal;
      });
      const preparedRateLookup = jest.fn().mockResolvedValue({
        available: true as const,
        rate: 1.1,
        rateAt: new Date('2026-08-27T00:00:00.000Z'),
        stale: false as const,
      });
      const conversion = {
        prepareRateSource: jest.fn(() => {
          if (insideTransaction) rootCallsInsideTransaction += 1;
          return Promise.resolve({ getRateMetadata: preparedRateLookup });
        }),
      };
      let transactionSequence = 0;
      const tx: any = {
        financePendingProposal: {
          findUnique: jest.fn().mockResolvedValue(proposal),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          update: jest.fn().mockResolvedValue(undefined),
        },
        financeAccount: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'account-1', currency: 'EUR' }]),
          findFirst: jest.fn(),
        },
        financeCategory: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'category-1', type: 'EXPENSE' }]),
          findFirst: jest.fn(),
        },
        financeTransaction: {
          create: jest.fn(({ data }) => {
            transactionSequence += 1;
            return Promise.resolve({
              id: `transaction-${transactionSequence}`,
              ...data,
              deletedAt: null,
              account: {
                id: 'account-1',
                name: 'Euro card',
                currency: 'EUR',
                type: 'CARD',
                emoji: null,
              },
              category: {
                id: 'category-1',
                name: 'Food',
                key: 'food',
                type: 'EXPENSE',
                emoji: null,
              },
              _count: { items: 0 },
            });
          }),
        },
        financeMerchantMapping: { upsert: jest.fn() },
      };
      const prisma: any = {
        financePendingProposal: { findUnique: rootProposalRead },
        financeProfile: { findUnique: jest.fn() },
        $transaction: jest.fn(async (callback) => {
          insideTransaction = true;
          try {
            return await callback(tx);
          } finally {
            insideTransaction = false;
          }
        }),
      };
      const ledger = new FinanceLedgerService(prisma, conversion as never);

      await expect(
        new FinanceProposalService(prisma, ledger).confirm(input),
      ).resolves.toMatchObject({
        transactionIds: Array.from(
          { length: operationCount },
          (_, index) => `transaction-${index + 1}`,
        ),
        duplicate: false,
      });

      expect(rootCallsInsideTransaction).toBe(0);
      expect(rootProposalRead).toHaveBeenCalledTimes(1);
      expect(conversion.prepareRateSource).toHaveBeenCalledTimes(1);
      expect(conversion.prepareRateSource).toHaveBeenCalledWith(
        'workspace-1',
        undefined,
      );
      expect(preparedRateLookup).toHaveBeenCalledTimes(1);
      expect(preparedRateLookup).toHaveBeenCalledWith('EUR', 'USD');
      expect(prisma.financeProfile.findUnique).not.toHaveBeenCalled();
      expect(tx.financeAccount.findMany).toHaveBeenCalledTimes(1);
      expect(tx.financeCategory.findMany).toHaveBeenCalledTimes(1);
      expect(tx.financeAccount.findFirst).not.toHaveBeenCalled();
      expect(tx.financeCategory.findFirst).not.toHaveBeenCalled();
      expect(tx.financeTransaction.create).toHaveBeenCalledTimes(
        operationCount,
      );
      expect(tx.financeTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            exchangeRateToDefault: new Prisma.Decimal(1.1),
            exchangeRateToValuation: new Prisma.Decimal(1.1),
            valuationCurrency: 'USD',
          }),
        }),
      );
      const transactionDbOperations =
        tx.financePendingProposal.findUnique.mock.calls.length +
        tx.financePendingProposal.updateMany.mock.calls.length +
        tx.financePendingProposal.update.mock.calls.length +
        tx.financeAccount.findMany.mock.calls.length +
        tx.financeCategory.findMany.mock.calls.length +
        tx.financeTransaction.create.mock.calls.length;
      expect(transactionDbOperations).toBe(operationCount + 5);
      expect(
        rootProposalRead.mock.calls.length +
          conversion.prepareRateSource.mock.calls.length +
          transactionDbOperations,
      ).toBe(operationCount + 7);
    },
  );

  it('does not claim a proposal when rate preparation fails', async () => {
    const prisma: any = {
      financePendingProposal: {
        findUnique: jest.fn().mockResolvedValue(pendingProposal()),
      },
      $transaction: jest.fn(),
    };
    const ledger = {
      prepareTransactionRateSource: jest
        .fn()
        .mockRejectedValue(new Error('rate unavailable')),
    };

    await expect(
      new FinanceProposalService(prisma, ledger as never).confirm(input),
    ).rejects.toThrow('rate unavailable');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects another bot or profile before loading financial rates', async () => {
    const prisma: any = {
      financePendingProposal: {
        findUnique: jest.fn().mockResolvedValue({
          ...pendingProposal(),
          botIntegrationId: 'bot-2',
        }),
      },
      $transaction: jest.fn(),
    };
    const ledger = { prepareTransactionRateSource: jest.fn() };

    await expect(
      new FinanceProposalService(prisma, ledger as never).confirm(input),
    ).rejects.toThrow('Finance proposal not found');
    expect(ledger.prepareTransactionRateSource).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
