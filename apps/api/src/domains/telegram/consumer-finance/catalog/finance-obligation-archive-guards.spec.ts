import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  archiveFinanceAccount,
  assertFinanceAccountArchivable,
  assertFinanceCategoryArchivable,
} from './finance-obligation-archive-guards';

describe('Finance obligation archive guards', () => {
  it('blocks accounts used by open debt or non-canceled regular payments', async () => {
    const prisma = {
      financeDebt: { count: jest.fn().mockResolvedValue(1) },
      financeRecurringPayment: { count: jest.fn().mockResolvedValue(0) },
    };
    await expect(
      assertFinanceAccountArchivable(prisma as never, 'profile-1', 'account-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.financeDebt.count).toHaveBeenCalledWith({
      where: { profileId: 'profile-1', accountId: 'account-1', status: 'OPEN' },
    });
    expect(prisma.financeRecurringPayment.count).toHaveBeenCalledWith({
      where: {
        profileId: 'profile-1',
        accountId: 'account-1',
        status: { not: 'CANCELED' },
      },
    });
  });

  it('allows canceled regular references but blocks a category used by a live one', async () => {
    const prisma = {
      financeDebt: { count: jest.fn().mockResolvedValue(0) },
      financeRecurringPayment: {
        count: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(1),
      },
    };
    await expect(
      assertFinanceAccountArchivable(prisma as never, 'profile-1', 'account-1'),
    ).resolves.toBeUndefined();
    await expect(
      assertFinanceCategoryArchivable(
        prisma as never,
        'profile-1',
        'category-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows account archive after an allocation was fully reallocated and released', async () => {
    const tx = {
      $executeRaw: jest.fn(),
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ allocated: new Prisma.Decimal(0) }]),
      financeAccount: {
        findFirst: jest.fn().mockResolvedValue({ id: 'account-1' }),
        update: jest.fn().mockResolvedValue({ id: 'account-1' }),
      },
      financeDebt: { count: jest.fn().mockResolvedValue(0) },
      financeRecurringPayment: { count: jest.fn().mockResolvedValue(0) },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };

    await expect(
      archiveFinanceAccount(prisma as never, 'profile-1', 'account-1'),
    ).resolves.toEqual({ id: 'account-1' });
    const queryCalls = tx.$queryRaw.mock.calls as unknown as Array<
      [Prisma.Sql]
    >;
    const query = queryCalls[0][0];
    expect(query.strings.join('')).toContain("WHEN kind = 'ALLOCATE'");
    expect(query.strings.join('')).toContain("WHEN kind = 'RELEASE'");
  });
});
