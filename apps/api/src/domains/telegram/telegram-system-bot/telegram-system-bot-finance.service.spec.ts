/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import {
  TelegramSystemBotFinanceDraftKind,
  TelegramSystemBotFinanceDraftStatus,
  TransactionType,
} from '@prisma/client';
import { TelegramSystemBotFinanceService } from './telegram-system-bot-finance.service';

const future = () => new Date(Date.now() + 60_000);

function setup() {
  const prisma = {
    workspaceMember: {
      findFirst: jest.fn().mockResolvedValue({ id: 'member' }),
    },
    account: { findMany: jest.fn() },
    transactionCategory: { findMany: jest.fn() },
    telegramSystemBotFinanceDraft: {
      create: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn(),
    },
  } as any;
  const transactions = { create: jest.fn().mockResolvedValue({ id: 'tx-1' }) };
  const transfers = {
    create: jest.fn().mockResolvedValue({ id: 'transfer-1' }),
  };
  const accounts = { findAll: jest.fn() };
  const moduleRef = {
    registerRequestByContextId: jest.fn(),
    resolve: jest.fn().mockImplementation((provider) => {
      if (provider.name === 'TransactionsService') return transactions;
      if (provider.name === 'TransfersService') return transfers;
      return accounts;
    }),
  } as any;
  return {
    service: new TelegramSystemBotFinanceService(prisma, moduleRef),
    prisma,
    transactions,
    transfers,
    accounts,
  };
}

describe('TelegramSystemBotFinanceService', () => {
  it('requires account and category choices even when only one option exists', async () => {
    const { service, prisma, transactions } = setup();
    prisma.account.findMany.mockResolvedValue([
      { id: 'account', name: 'Main', currency: 'USD' },
    ]);
    prisma.transactionCategory.findMany.mockResolvedValue([
      { id: 'category', name: 'Hosting' },
    ]);
    prisma.telegramSystemBotFinanceDraft.create.mockResolvedValue({
      id: 'draft',
    });

    await expect(
      service.beginTransaction({
        connectionId: 'connection',
        userId: 'user',
        workspaceId: 'workspace',
        type: TransactionType.expense,
      }),
    ).resolves.toMatchObject({
      kind: 'ACCOUNT',
      buttons: [{ callback_data: 'finance:account:draft:0' }],
    });

    expect(transactions.create).not.toHaveBeenCalled();
  });

  it('moves transaction selection from account to category and then amount input', async () => {
    const { service, prisma } = setup();
    const draft = {
      id: 'draft',
      connectionId: 'connection',
      workspaceId: 'workspace',
      kind: TelegramSystemBotFinanceDraftKind.TRANSACTION,
      type: TransactionType.expense,
      status: TelegramSystemBotFinanceDraftStatus.PENDING,
      expiresAt: future(),
    };
    prisma.telegramSystemBotFinanceDraft.findFirst.mockResolvedValue(draft);
    prisma.telegramSystemBotFinanceDraft.update.mockImplementation(
      ({ data }) => ({ ...draft, ...data }),
    );
    prisma.account.findMany.mockResolvedValue([
      { id: 'account', name: 'Main', currency: 'USD' },
    ]);
    prisma.transactionCategory.findMany.mockResolvedValue([
      { id: 'category', name: 'Hosting' },
    ]);

    await expect(
      service.choose({
        connectionId: 'connection',
        userId: 'user',
        draftId: 'draft',
        kind: 'account',
        index: 0,
      }),
    ).resolves.toMatchObject({ kind: 'CATEGORY' });
    await expect(
      service.choose({
        connectionId: 'connection',
        userId: 'user',
        draftId: 'draft',
        kind: 'category',
        index: 0,
      }),
    ).resolves.toMatchObject({ kind: 'INPUT' });
  });

  it('validates transaction amount and returns an explicit confirmation', async () => {
    const { service, prisma } = setup();
    const draft = {
      id: 'draft',
      connectionId: 'connection',
      workspaceId: 'workspace',
      kind: TelegramSystemBotFinanceDraftKind.TRANSACTION,
      type: TransactionType.expense,
      amount: null,
      description: null,
      accountId: 'account',
      categoryId: 'category',
      fromAccountId: null,
      toAccountId: null,
      fromAmount: null,
      toAmount: null,
      status: TelegramSystemBotFinanceDraftStatus.PENDING,
      expiresAt: future(),
    };
    prisma.telegramSystemBotFinanceDraft.findFirst.mockResolvedValue(draft);
    prisma.telegramSystemBotFinanceDraft.update.mockImplementation(
      ({ data }) => ({ ...draft, ...data }),
    );
    prisma.account.findMany.mockResolvedValue([
      { id: 'account', name: 'Main', currency: 'USD' },
    ]);
    prisma.transactionCategory.findMany.mockResolvedValue([
      { id: 'category', name: 'Hosting' },
    ]);

    await expect(
      service.submitInput({
        connectionId: 'connection',
        userId: 'user',
        workspaceId: 'workspace',
        text: 'wrong amount',
      }),
    ).resolves.toMatchObject({ kind: 'INPUT' });
    await expect(
      service.submitInput({
        connectionId: 'connection',
        userId: 'user',
        workspaceId: 'workspace',
        text: '42.50 hosting',
      }),
    ).resolves.toMatchObject({
      kind: 'CONFIRM',
      callbackData: 'finance:confirm:draft',
    });
  });

  it('claims and creates a transaction only after confirmation', async () => {
    const { service, prisma, transactions } = setup();
    const draft = {
      id: 'draft',
      connectionId: 'connection',
      workspaceId: 'workspace',
      kind: TelegramSystemBotFinanceDraftKind.TRANSACTION,
      type: TransactionType.expense,
      amount: 42,
      description: 'hosting',
      accountId: 'account',
      categoryId: 'category',
      transactionId: null,
      transferId: null,
      status: TelegramSystemBotFinanceDraftStatus.PENDING,
      expiresAt: future(),
    };
    prisma.telegramSystemBotFinanceDraft.findFirst.mockResolvedValue(draft);
    prisma.telegramSystemBotFinanceDraft.update.mockResolvedValue({});

    await expect(
      service.confirm({
        connectionId: 'connection',
        userId: 'user',
        draftId: 'draft',
      }),
    ).resolves.toEqual({
      kind: 'COMPLETED',
      operation: 'transaction',
      id: 'tx-1',
    });
    expect(transactions.create).toHaveBeenCalledWith(
      'user',
      expect.objectContaining({
        accountId: 'account',
        categoryId: 'category',
        amount: 42,
      }),
    );
  });

  it('creates a cross-currency transfer with distinct sent and received amounts', async () => {
    const { service, prisma, transfers } = setup();
    const draft = {
      id: 'transfer-draft',
      connectionId: 'connection',
      workspaceId: 'workspace',
      kind: TelegramSystemBotFinanceDraftKind.TRANSFER,
      type: null,
      amount: null,
      description: 'exchange',
      accountId: null,
      categoryId: null,
      fromAccountId: 'usd',
      toAccountId: 'eur',
      fromAmount: 100,
      toAmount: 92,
      transactionId: null,
      transferId: null,
      status: TelegramSystemBotFinanceDraftStatus.PENDING,
      expiresAt: future(),
    };
    prisma.telegramSystemBotFinanceDraft.findFirst.mockResolvedValue(draft);
    prisma.telegramSystemBotFinanceDraft.update.mockResolvedValue({});

    await expect(
      service.confirm({
        connectionId: 'connection',
        userId: 'user',
        draftId: 'transfer-draft',
      }),
    ).resolves.toEqual({
      kind: 'COMPLETED',
      operation: 'transfer',
      id: 'transfer-1',
    });
    expect(transfers.create).toHaveBeenCalledWith(
      'user',
      expect.objectContaining({
        fromAccountId: 'usd',
        toAccountId: 'eur',
        fromAmount: 100,
        toAmount: 92,
      }),
    );
  });

  it('rejects an inaccessible account index without changing the draft', async () => {
    const { service, prisma } = setup();
    prisma.telegramSystemBotFinanceDraft.findFirst.mockResolvedValue({
      id: 'draft',
      connectionId: 'connection',
      workspaceId: 'workspace',
      kind: TelegramSystemBotFinanceDraftKind.TRANSACTION,
      type: TransactionType.income,
      status: TelegramSystemBotFinanceDraftStatus.PENDING,
      expiresAt: future(),
    });
    prisma.account.findMany.mockResolvedValue([]);
    prisma.transactionCategory.findMany.mockResolvedValue([
      { id: 'category', name: 'Sales' },
    ]);

    await expect(
      service.choose({
        connectionId: 'connection',
        userId: 'user',
        draftId: 'draft',
        kind: 'account',
        index: 0,
      }),
    ).rejects.toThrow('Account is no longer available');
    expect(prisma.telegramSystemBotFinanceDraft.update).not.toHaveBeenCalled();
  });
});
