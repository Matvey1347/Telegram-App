import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FinanceSavingsGoalService } from './finance-savings-goal.service';

describe('FinanceSavingsGoalService', () => {
  it('creates and edits an owned goal while preserving server projections', async () => {
    const prisma = {
      financeSavingsGoal: {
        create: jest.fn().mockResolvedValue({ id: 'goal-1' }),
        findFirst: jest.fn().mockResolvedValue({
          currency: 'USD',
          currentAllocated: new Prisma.Decimal(0),
          status: 'ACTIVE',
          version: 1,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const reads = { goal: jest.fn().mockResolvedValue({ id: 'goal-1' }) };
    const service = new FinanceSavingsGoalService(
      prisma as never,
      reads as never,
    );
    const input = { name: 'Home', targetAmount: '100', currency: 'USD' };
    await service.create('profile-1', input);
    await service.update('profile-1', 'goal-1', { ...input, name: 'New home' });
    expect(prisma.financeSavingsGoal.create).toHaveBeenCalled();
    expect(prisma.financeSavingsGoal.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'goal-1', profileId: 'profile-1', version: 1 },
      }),
    );
  });

  it('requires allocations to be released before archive', async () => {
    const service = new FinanceSavingsGoalService(
      {
        financeSavingsGoal: {
          findFirst: jest.fn().mockResolvedValue({
            linkedAllocated: new Prisma.Decimal(1),
            status: 'ACTIVE',
            version: 1,
          }),
        },
      } as never,
      {} as never,
    );
    await expect(service.archive('profile-1', 'goal-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('archives legacy-only goals and rejects an allocation race', async () => {
    const reads = { goal: jest.fn().mockResolvedValue({ id: 'goal-1' }) };
    const updateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const service = new FinanceSavingsGoalService(
      {
        financeSavingsGoal: {
          findFirst: jest.fn().mockResolvedValue({
            linkedAllocated: new Prisma.Decimal(0),
            currentAllocated: new Prisma.Decimal(25),
            status: 'ACTIVE',
            version: 1,
          }),
          updateMany,
        },
      } as never,
      reads as never,
    );

    await expect(service.archive('profile-1', 'goal-1')).resolves.toEqual({
      id: 'goal-1',
    });
    await expect(service.archive('profile-1', 'goal-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    const calls = updateMany.mock.calls as unknown as Array<
      [{ where: { linkedAllocated: number; version: number } }]
    >;
    expect(calls[0][0].where).toMatchObject({
      linkedAllocated: 0,
      version: 1,
    });
  });

  it('does not complete a goal that was concurrently archived', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const service = new FinanceSavingsGoalService(
      {
        financeSavingsGoal: {
          findFirst: jest.fn().mockResolvedValue({
            status: 'ACTIVE',
            version: 1,
          }),
          updateMany,
        },
      } as never,
      {} as never,
    );

    await expect(
      service.complete('profile-1', 'goal-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    const calls = updateMany.mock.calls as unknown as Array<
      [{ where: { status: string; version: number } }]
    >;
    expect(calls[0][0].where).toMatchObject({
      status: 'ACTIVE',
      version: 1,
    });
  });
});
