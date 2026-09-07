import { NotFoundException } from '@nestjs/common';
import { TransactionsService } from './transactions.service';

describe('TransactionsService advertising expenses', () => {
  const makeService = () => {
    const callOrder: string[] = [];
    let createdTelegramChannelId: string | null | undefined;
    const prisma = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ primaryCurrency: 'USD' }),
      },
      account: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'account-1', currency: 'USD' }),
      },
      transactionCategory: { findFirst: jest.fn() },
      workspaceMember: { findFirst: jest.fn() },
      telegramChannel: { findFirst: jest.fn() },
      transaction: {
        findFirst: jest.fn(),
        create: jest
          .fn()
          .mockImplementation(
            (input: { data: { telegramChannelId: string | null } }) => {
              createdTelegramChannelId = input.data.telegramChannelId;
              return Promise.resolve({
                id: 'tx-1',
                telegramChannelId: input.data.telegramChannelId,
                categoryId: 'cat-advertising',
                category: 'Advertising',
                telegramChannel: input.data.telegramChannelId ? channel : null,
              });
            },
          ),
        update: jest.fn().mockResolvedValue({
          id: 'tx-1',
          telegramChannelId: 'channel-1',
          categoryId: 'cat-advertising',
          category: 'Advertising',
          telegramChannel: {
            id: 'channel-1',
            title: 'Owned Channel',
            username: 'owned_channel',
            photoUrl: null,
          },
        }),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $executeRaw: jest.fn(),
      $executeRawUnsafe: jest.fn().mockImplementation(() => {
        callOrder.push('schema-ready');
        return Promise.resolve(0);
      }),
      $transaction: jest
        .fn()
        .mockImplementation((callback: (client: never) => Promise<unknown>) => {
          callOrder.push('transaction-started');
          return callback(prisma as never);
        }),
    };
    const workspaceService = {
      resolveAssignedMemberId: jest.fn().mockResolvedValue({
        workspaceId: 'ws-1',
        assignedMemberId: null,
      }),
      resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('ws-1'),
    };
    const service = new TransactionsService(
      prisma as never,
      workspaceService as never,
      { getRate: jest.fn().mockResolvedValue(1) } as never,
      { ensureSystemCategories: jest.fn() } as never,
    );
    return {
      callOrder,
      getCreatedTelegramChannelId: () => createdTelegramChannelId,
      prisma,
      service,
    };
  };

  const advertisingCategory = {
    id: 'cat-advertising',
    type: 'expense',
    key: 'advertising',
    name: 'Advertising',
  } as const;
  const channel = {
    id: 'channel-1',
    title: 'Owned Channel',
    username: 'owned_channel',
    photoUrl: null,
  };

  it('attributes an Advertising expense to the selected workspace channel', async () => {
    const { getCreatedTelegramChannelId, prisma, service } = makeService();
    prisma.transactionCategory.findFirst.mockResolvedValue(advertisingCategory);
    prisma.telegramChannel.findFirst.mockResolvedValue(channel);

    await service.create('user-1', {
      accountId: 'account-1',
      type: 'expense',
      amount: 125,
      categoryId: 'cat-advertising',
      telegramChannelId: 'channel-1',
      date: '2026-09-06',
    });

    expect(prisma.telegramChannel.findFirst).toHaveBeenCalledWith({
      where: { id: 'channel-1', workspaceId: 'ws-1' },
      select: {
        id: true,
        title: true,
        username: true,
        photoUrl: true,
      },
    });
    expect(getCreatedTelegramChannelId()).toBe('channel-1');
  });

  it('rejects a channel outside the current workspace', async () => {
    const { prisma, service } = makeService();
    prisma.transactionCategory.findFirst.mockResolvedValue(advertisingCategory);
    prisma.telegramChannel.findFirst.mockResolvedValue(null);

    await expect(
      service.create('user-1', {
        accountId: 'account-1',
        type: 'expense',
        amount: 125,
        categoryId: 'cat-advertising',
        telegramChannelId: 'other-workspace-channel',
        date: '2026-09-06',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('keeps the channel optional for an Advertising expense', async () => {
    const { getCreatedTelegramChannelId, prisma, service } = makeService();
    prisma.transactionCategory.findFirst.mockResolvedValue(advertisingCategory);

    await service.create('user-1', {
      accountId: 'account-1',
      type: 'expense',
      amount: 125,
      categoryId: 'cat-advertising',
      date: '2026-09-06',
    });

    expect(prisma.telegramChannel.findFirst).not.toHaveBeenCalled();
    expect(getCreatedTelegramChannelId()).toBeNull();
  });

  it('finishes the schema readiness check before opening an update transaction', async () => {
    const { callOrder, prisma, service } = makeService();
    prisma.transaction.findFirst.mockResolvedValue({
      id: 'tx-1',
      workspaceId: 'ws-1',
      accountId: 'account-1',
      type: 'expense',
      amount: 100,
      categoryId: 'cat-advertising',
      memberId: null,
      telegramChannelId: 'channel-1',
    });
    prisma.transactionCategory.findFirst.mockResolvedValue(advertisingCategory);
    prisma.telegramChannel.findFirst.mockResolvedValue(channel);

    await service.update('user-1', 'tx-1', {
      amount: 125,
      telegramChannelId: 'channel-1',
    });

    expect(callOrder.indexOf('schema-ready')).toBeGreaterThanOrEqual(0);
    expect(callOrder.indexOf('schema-ready')).toBeLessThan(
      callOrder.indexOf('transaction-started'),
    );
  });
});
