import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FinanceSavingsService } from './finance-savings.service';

const occurredAt = new Date('2026-09-08T00:00:00.000Z');

function movement(kind: 'ALLOCATE' | 'RELEASE' | 'REALLOCATE') {
  return {
    id: `movement-${kind}`,
    kind,
    fromGoalId: kind === 'ALLOCATE' ? null : 'goal-from',
    toGoalId: kind === 'RELEASE' ? null : 'goal-to',
    accountId: 'account-1',
    amount: new Prisma.Decimal(25),
    currency: 'USD',
    occurredAt,
    note: null,
    linkedTransferId: null,
    createdAt: occurredAt,
    account: {
      id: 'account-1',
      name: 'Cash',
      currency: 'USD',
      type: 'CASH' as const,
      emoji: null,
    },
  };
}

function setup() {
  const tx = {
    financeAccount: {
      findFirst: jest.fn().mockResolvedValue({ id: 'account-1' }),
    },
    financeSavingsGoal: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    financeSavingsMovement: { create: jest.fn() },
  };
  const prisma = {
    financeSavingsMovement: { findUnique: jest.fn().mockResolvedValue(null) },
    financeAccount: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'account-1', currency: 'USD' }),
    },
    financeSavingsGoal: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'goal-to',
        currency: 'USD',
        status: 'ACTIVE',
        version: 1,
      }),
      findMany: jest.fn().mockResolvedValue([
        { id: 'goal-from', currency: 'USD', status: 'COMPLETED', version: 1 },
        { id: 'goal-to', currency: 'USD', status: 'ACTIVE', version: 1 },
      ]),
    },
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
  const allocations = {
    lock: jest.fn().mockResolvedValue(undefined),
    lockTransfer: jest.fn().mockResolvedValue(undefined),
    duplicate: jest.fn().mockResolvedValue(null),
    validateTransfer: jest.fn().mockResolvedValue(undefined),
    state: jest.fn().mockResolvedValue({
      accountBalance: new Prisma.Decimal(100),
      accountAllocated: new Prisma.Decimal(25),
      goalAllocated: new Prisma.Decimal(25),
    }),
  };
  const reads = {
    goals: jest.fn().mockResolvedValue([{ id: 'goal-to' }]),
  };
  return {
    prisma,
    tx,
    allocations,
    service: new FinanceSavingsService(
      prisma as never,
      {
        profileContext: jest
          .fn()
          .mockResolvedValue({ id: 'profile-1', defaultCurrency: 'USD' }),
      } as never,
      reads as never,
      allocations,
      {} as never,
    ),
  };
}

describe('FinanceSavingsService', () => {
  it.each([
    ['ALLOCATE', '25'],
    ['RELEASE', '-25'],
  ] as const)(
    'updates %s projections without writing the ledger',
    async (kind, delta) => {
      const { service, tx } = setup();
      tx.financeSavingsMovement.create.mockResolvedValue(movement(kind));
      const input = {
        accountId: 'account-1',
        amount: '25',
        occurredAt: occurredAt.toISOString(),
        idempotencyKey: `movement-${kind}`,
      };
      if (kind === 'ALLOCATE')
        await service.allocate('profile-1', 'goal-to', input);
      else {
        await service.release('profile-1', 'goal-to', input);
      }
      const calls = tx.financeSavingsGoal.updateMany.mock
        .calls as unknown as Array<
        [{ data: { currentAllocated: { increment: Prisma.Decimal } } }]
      >;
      expect(calls[0][0].data.currentAllocated.increment.toString()).toBe(
        delta,
      );
    },
  );

  it('moves allocation out of a completed goal into an active goal', async () => {
    const { service, tx } = setup();
    tx.financeSavingsMovement.create.mockResolvedValue(movement('REALLOCATE'));
    await service.reallocate('profile-1', {
      fromGoalId: 'goal-from',
      toGoalId: 'goal-to',
      accountId: 'account-1',
      amount: '25',
      occurredAt: occurredAt.toISOString(),
      idempotencyKey: 'move-goals',
    });
    const calls = tx.financeSavingsGoal.updateMany.mock
      .calls as unknown as Array<
      [{ data: { linkedAllocated: { increment: Prisma.Decimal } } }]
    >;
    expect(
      calls.map((call) => call[0].data.linkedAllocated.increment.toString()),
    ).toEqual(['-25', '25']);
  });

  it('locks and revalidates a linked transfer inside the allocation transaction', async () => {
    const { service, tx, allocations } = setup();
    tx.financeSavingsMovement.create.mockResolvedValue(movement('ALLOCATE'));

    await service.allocate('profile-1', 'goal-to', {
      accountId: 'account-1',
      amount: '25',
      occurredAt: occurredAt.toISOString(),
      linkedTransferId: 'transfer-1',
      idempotencyKey: 'linked-allocation',
    });

    expect(allocations.lockTransfer).toHaveBeenCalledWith(
      tx,
      'profile-1',
      'transfer-1',
    );
    expect(allocations.validateTransfer).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ transferId: 'transfer-1' }),
    );
    expect(allocations.lockTransfer.mock.invocationCallOrder[0]).toBeLessThan(
      allocations.validateTransfer.mock.invocationCallOrder[0],
    );
  });

  it('rejects a foreign account and an insufficient release', async () => {
    const foreign = setup();
    foreign.prisma.financeAccount.findFirst.mockResolvedValue(null);
    await expect(
      foreign.service.allocate('profile-1', 'goal-to', {
        accountId: 'foreign',
        amount: '25',
        occurredAt: occurredAt.toISOString(),
        idempotencyKey: 'foreign-account',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const insufficient = setup();
    insufficient.allocations.state.mockResolvedValue({
      accountBalance: new Prisma.Decimal(100),
      accountAllocated: new Prisma.Decimal(0),
      goalAllocated: new Prisma.Decimal(0),
    });
    insufficient.tx.financeSavingsMovement.create.mockResolvedValue(
      movement('RELEASE'),
    );
    await expect(
      insufficient.service.release('profile-1', 'goal-to', {
        accountId: 'account-1',
        amount: '25',
        occurredAt: occurredAt.toISOString(),
        idempotencyKey: 'insufficient',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
