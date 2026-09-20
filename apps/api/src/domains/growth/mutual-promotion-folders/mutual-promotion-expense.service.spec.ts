/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- Jest mock call tuples use any in focused transaction assertions */
import { Prisma } from '@prisma/client';
import { MutualPromotionExpenseService } from './mutual-promotion-expense.service';

describe('MutualPromotionExpenseService bulk folder expenses', () => {
  function setup(options?: { accountWorkspace?: string; currency?: string }) {
    const tx = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ primaryCurrency: 'USD' }),
      },
      account: {
        findMany: jest
          .fn()
          .mockResolvedValue(
            options?.accountWorkspace === 'other'
              ? []
              : [{ id: 'account-1', currency: options?.currency ?? 'USD' }],
          ),
      },
      transactionCategory: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'category-1',
          name: 'Advertising',
        }),
      },
      exchangeRate: { findMany: jest.fn().mockResolvedValue([]) },
      transaction: { createMany: jest.fn().mockResolvedValue({ count: 3 }) },
    };
    const financeCategories = {
      ensureSystemCategories: jest.fn().mockResolvedValue(undefined),
    };
    const service = new MutualPromotionExpenseService(
      {} as never,
      {} as never,
      financeCategories as never,
      {} as never,
    );
    const input = (count: number) => ({
      workspaceId: 'workspace-1',
      folderId: 'folder-1',
      folderTitle: 'September',
      startsAt: new Date('2026-09-19T10:00:00Z'),
      assignedMemberId: null,
      participants: Array.from({ length: count }, (_, index) => ({
        id: `participant-${index}`,
        telegramChannelId: `channel-${index}`,
        role: 'PAID' as const,
      })),
      expenseAllocation: {
        mode: 'EQUAL' as const,
        accountId: 'account-1',
        totalAmount: 10,
      },
    });
    return { service, tx, financeCategories, input };
  }

  it('allocates every cent of 10 across 3 channels deterministically', async () => {
    const { service, tx, input } = setup();

    await service.createMany(tx as never, input(3));

    expect(tx.transaction.createMany).toHaveBeenCalledTimes(1);
    const rows = tx.transaction.createMany.mock.calls[0][0].data as Array<{
      amount: Prisma.Decimal;
      mutualPromotionParticipantId: string;
      accountId: string;
    }>;
    expect(rows.map((row) => row.amount.toFixed(2))).toEqual([
      '3.34',
      '3.33',
      '3.33',
    ]);
    expect(
      rows
        .reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0))
        .toFixed(2),
    ).toBe('10.00');
    expect(rows.map((row) => row.mutualPromotionParticipantId)).toEqual([
      'participant-0',
      'participant-1',
      'participant-2',
    ]);
    expect(rows.every((row) => row.accountId === 'account-1')).toBe(true);
  });

  it('rejects mixed publisher and individual-expense modes', async () => {
    const { service, tx, input } = setup();
    const publisher = input(2);
    publisher.participants[1].role = 'PUBLISHER' as 'PAID';
    await expect(service.createMany(tx as never, publisher)).rejects.toThrow(
      'only paid participants',
    );
    const mixed = input(2);
    const withExpense = {
      ...mixed,
      participants: [
        {
          ...mixed.participants[0],
          expense: { accountId: 'account-1', amount: 5 },
        },
        mixed.participants[1],
      ],
    };
    await expect(service.createMany(tx as never, withExpense)).rejects.toThrow(
      'without individual expenses',
    );
    expect(tx.workspace.findUnique).not.toHaveBeenCalled();
    expect(tx.transaction.createMany).not.toHaveBeenCalled();
  });

  it('rejects a foreign-workspace account before writing transactions', async () => {
    const { service, tx, input } = setup({ accountWorkspace: 'other' });
    await expect(service.createMany(tx as never, input(3))).rejects.toThrow(
      'Expense account not found',
    );
    expect(tx.account.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['account-1'] },
        workspaceId: 'workspace-1',
        deletedAt: null,
      },
      select: { id: true, currency: true },
    });
    expect(tx.transaction.createMany).not.toHaveBeenCalled();
  });

  it('uses bounded financial reads and one write for 100 channels', async () => {
    const { service, tx, financeCategories, input } = setup();
    await service.createMany(tx as never, input(100));
    expect(tx.workspace.findUnique).toHaveBeenCalledTimes(1);
    expect(tx.account.findMany).toHaveBeenCalledTimes(1);
    expect(financeCategories.ensureSystemCategories).toHaveBeenCalledTimes(1);
    expect(tx.transactionCategory.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.exchangeRate.findMany).not.toHaveBeenCalled();
    expect(tx.transaction.createMany).toHaveBeenCalledTimes(1);
    expect(tx.transaction.createMany.mock.calls[0][0].data).toHaveLength(100);
  });

  it('bulk-creates 100 participants once before preparing their expenses', async () => {
    const { service, tx, input } = setup();
    const data = input(100);
    const createManyAndReturn = jest.fn().mockResolvedValue(
      data.participants.map((row) => ({
        id: row.id,
        telegramChannelId: row.telegramChannelId,
        role: row.role,
      })),
    );
    const client = {
      ...tx,
      mutualPromotionFolderParticipant: { createManyAndReturn },
    };
    await service.createForFolder(
      client as never,
      {
        id: data.folderId,
        workspaceId: data.workspaceId,
        title: data.folderTitle,
        startsAt: data.startsAt,
        assignedMemberId: data.assignedMemberId,
      },
      data.participants.map((row) => ({
        ...row,
        inviteLinkId: `link-${row.id}`,
      })),
      data.expenseAllocation,
    );
    expect(createManyAndReturn).toHaveBeenCalledTimes(1);
    expect(createManyAndReturn.mock.calls[0][0].data).toHaveLength(100);
    expect(createManyAndReturn.mock.calls[0][0].data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ inviteLinkMode: 'REUSABLE' }),
      ]),
    );
    expect(tx.transaction.createMany).toHaveBeenCalledTimes(1);
  });

  it('keeps existing per-participant expense input compatible', async () => {
    const { service, tx, input } = setup();
    const data = input(2);
    await service.createMany(tx as never, {
      ...data,
      expenseAllocation: null,
      participants: [
        {
          ...data.participants[0],
          expense: { accountId: 'account-1', amount: 7 },
        },
        data.participants[1],
      ],
    });
    expect(tx.transaction.createMany.mock.calls[0][0].data).toHaveLength(1);
    expect(
      tx.transaction.createMany.mock.calls[0][0].data[0].amount.toString(),
    ).toBe('7');
  });
});
