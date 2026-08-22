import { FinanceChatFlowService } from './finance-chat-flow.service';

describe('FinanceChatFlowService', () => {
  const future = new Date(Date.now() + 60_000);
  const prisma = {
    financeChatFlow: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    financeAccount: { findFirst: jest.fn(), findMany: jest.fn() },
    financeCategory: { findFirst: jest.fn(), findMany: jest.fn() },
    financeTransaction: { findFirst: jest.fn() },
    financeTransfer: { findFirst: jest.fn() },
  };
  const core = {
    createAccount: jest.fn(),
    updateAccount: jest.fn(),
    categories: jest.fn(),
    createCategory: jest.fn(),
    updateCategory: jest.fn(),
    archiveCategory: jest.fn(),
    profile: jest.fn(),
    updateSettings: jest.fn(),
  };
  const ledger = {
    profileContext: jest.fn(),
    createTransaction: jest.fn(),
    accounts: jest.fn(),
  };
  const transfers = { create: jest.fn() };
  const service = new FinanceChatFlowService(
    prisma as any,
    core as any,
    ledger as any,
    transfers as any,
  );
  const input = {
    profileId: 'profile-1',
    botIntegrationId: 'bot-1',
    telegramBotUserId: 'user-1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.financeChatFlow.findUnique.mockReset();
    prisma.financeAccount.findFirst.mockResolvedValue({
      id: 'a-1',
      name: 'Cash',
      currency: 'USD',
      type: 'CASH',
      emoji: null,
    });
    prisma.financeAccount.findMany.mockResolvedValue([
      { id: 'a-1', name: 'Cash', currency: 'USD', type: 'CASH', emoji: null },
    ]);
    prisma.financeCategory.findFirst.mockResolvedValue({
      id: 'c-1',
      name: 'Food',
      key: 'food',
    });
    prisma.financeTransaction.findFirst.mockResolvedValue(null);
    prisma.financeTransfer.findFirst.mockResolvedValue(null);
  });

  it.each(['INCOME', 'EXPENSE'] as const)(
    'starts %s with an explicit account choice even when only one account exists',
    async (type) => {
      await expect(
        service.startTransaction({ ...input, type }),
      ).resolves.toMatchObject({
        kind: 'prompt',
        step: 'TRANSACTION_ACCOUNT',
        payload: { type },
        choices: [{ id: 'a-1', label: '💵 Cash · USD' }],
      });
      expect(prisma.financeChatFlow.upsert).toHaveBeenCalledTimes(1);
      const create = prisma.financeChatFlow.upsert.mock.calls[0][0].create;
      expect(create).not.toHaveProperty('type');
      expect(create).not.toHaveProperty('flow');
    },
  );

  it('shows a bounded account picker when multiple accounts exist', async () => {
    prisma.financeAccount.findMany.mockResolvedValue([
      { id: 'a-1', name: 'Cash', currency: 'USD', type: 'CASH', emoji: null },
      { id: 'a-2', name: 'Card', currency: 'EUR', type: 'CARD', emoji: null },
    ]);
    await expect(
      service.startTransaction({ ...input, type: 'EXPENSE' }),
    ).resolves.toMatchObject({
      kind: 'prompt',
      step: 'TRANSACTION_ACCOUNT',
      choices: [
        { id: 'a-1', label: '💵 Cash · USD' },
        { id: 'a-2', label: '💳 Card · EUR' },
      ],
    });
  });

  it('does not create a draft when there is no active account', async () => {
    prisma.financeAccount.findMany.mockResolvedValue([]);
    await expect(
      service.startTransaction({ ...input, type: 'INCOME' }),
    ).resolves.toBeNull();
    expect(prisma.financeChatFlow.upsert).not.toHaveBeenCalled();
  });

  it('moves account selection to category and Back to the account picker', async () => {
    const payload = { type: 'INCOME', revision: 'rev-income' };
    prisma.financeChatFlow.findUnique
      .mockResolvedValueOnce({
        id: 'flow-1',
        profileId: input.profileId,
        operationKind: 'TRANSACTION_CREATE',
        status: 'ACTIVE',
        step: 'TRANSACTION_ACCOUNT',
        payload,
        expiresAt: future,
      })
      .mockResolvedValueOnce({
        id: 'flow-1',
        profileId: input.profileId,
        operationKind: 'TRANSACTION_CREATE',
        status: 'ACTIVE',
        step: 'TRANSACTION_CATEGORY',
        payload: {
          ...payload,
          accountId: 'a-1',
          accountName: 'Cash',
          accountCurrency: 'USD',
        },
        expiresAt: future,
      });

    await expect(
      service.consumeCallback({
        ...input,
        callback: { action: 'account', id: 'a-1', revision: 'rev-income' },
      }),
    ).resolves.toMatchObject({
      kind: 'prompt',
      step: 'TRANSACTION_CATEGORY',
      payload: {
        accountId: 'a-1',
        accountName: 'Cash',
        accountCurrency: 'USD',
      },
    });
    await expect(
      service.consumeCallback({
        ...input,
        callback: { action: 'back', revision: 'rev-income' },
      }),
    ).resolves.toMatchObject({ kind: 'prompt', step: 'TRANSACTION_ACCOUNT' });
  });

  it('keeps an expense draft server-side and writes once only after confirmation', async () => {
    const row = (step: string, payload: object) => ({
      id: 'flow-1',
      profileId: input.profileId,
      operationKind: 'TRANSACTION_CREATE',
      status: 'ACTIVE',
      step,
      payload,
      expiresAt: future,
    });
    prisma.financeChatFlow.findUnique
      .mockResolvedValueOnce(
        row('TRANSACTION_ACCOUNT', {
          type: 'EXPENSE',
          occurredAt: '2026-01-01T00:00:00.000Z',
        }),
      )
      .mockResolvedValueOnce(
        row('TRANSACTION_CATEGORY', {
          type: 'EXPENSE',
          accountId: 'a-1',
          accountName: 'Cash',
          accountCurrency: 'USD',
          occurredAt: '2026-01-01T00:00:00.000Z',
        }),
      )
      .mockResolvedValueOnce(
        row('TRANSACTION_AMOUNT', {
          type: 'EXPENSE',
          accountId: 'a-1',
          accountName: 'Cash',
          accountCurrency: 'USD',
          categoryId: 'c-1',
          categoryName: 'Food',
          categoryKey: 'food',
          occurredAt: '2026-01-01T00:00:00.000Z',
        }),
      )
      .mockResolvedValueOnce(
        row('TRANSACTION_DESCRIPTION', {
          type: 'EXPENSE',
          accountId: 'a-1',
          accountName: 'Cash',
          accountCurrency: 'USD',
          amount: '12.50',
          categoryId: 'c-1',
          categoryName: 'Food',
          categoryKey: 'food',
          occurredAt: '2026-01-01T00:00:00.000Z',
        }),
      )
      .mockResolvedValueOnce(
        row('TRANSACTION_REVIEW', {
          type: 'EXPENSE',
          description: 'Coffee',
          accountId: 'a-1',
          amount: '12.50',
          categoryId: 'c-1',
          occurredAt: '2026-01-01T00:00:00.000Z',
        }),
      );
    prisma.financeChatFlow.updateMany.mockResolvedValue({ count: 1 });
    ledger.profileContext.mockResolvedValue({
      id: input.profileId,
      defaultCurrency: 'USD',
    });
    ledger.createTransaction.mockResolvedValue({ id: 'tx-1' });

    await service.consumeCallback({
      ...input,
      callback: { action: 'account', id: 'a-1' },
    });
    await service.consumeCallback({
      ...input,
      callback: { action: 'category', id: 'c-1' },
    });
    await service.consumeText({ ...input, text: '12.50' });
    await service.consumeText({ ...input, text: 'Coffee' });
    await expect(
      service.consumeCallback({ ...input, callback: { action: 'confirm' } }),
    ).resolves.toMatchObject({
      kind: 'created',
      flow: 'TRANSACTION_CREATE',
      id: 'tx-1',
    });
    expect(ledger.createTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        amount: '12.50',
        accountId: 'a-1',
        categoryId: 'c-1',
        description: 'Coffee',
      }),
      'CHAT',
      expect.any(String),
    );
    expect(prisma.financeTransaction.findFirst).not.toHaveBeenCalled();
  });

  it('accepts a decimal comma and rejects zero, negative, and malformed amounts', async () => {
    const amountRow = () => ({
      id: 'flow-1',
      profileId: input.profileId,
      operationKind: 'TRANSACTION_CREATE',
      status: 'ACTIVE',
      step: 'TRANSACTION_AMOUNT',
      payload: { type: 'EXPENSE', accountId: 'a-1' },
      expiresAt: future,
    });
    prisma.financeChatFlow.findUnique.mockImplementation(() =>
      Promise.resolve(amountRow()),
    );

    await expect(
      service.consumeText({ ...input, text: '12,50' }),
    ).resolves.toMatchObject({
      step: 'TRANSACTION_DESCRIPTION',
      payload: { amount: '12.50' },
    });
    for (const text of ['0', '-1', '12.345', 'coffee'])
      await expect(service.consumeText({ ...input, text })).resolves.toEqual({
        kind: 'invalid',
        flow: 'TRANSACTION_CREATE',
        reason: 'amount',
      });
    expect(prisma.financeChatFlow.update).toHaveBeenCalledTimes(1);
  });

  it('validates that a selected category matches the transaction type', async () => {
    prisma.financeChatFlow.findUnique.mockResolvedValue({
      id: 'flow-1',
      profileId: input.profileId,
      operationKind: 'TRANSACTION_CREATE',
      status: 'ACTIVE',
      step: 'TRANSACTION_CATEGORY',
      payload: { type: 'INCOME', revision: 'rev-income' },
      expiresAt: future,
    });
    await service.consumeCallback({
      ...input,
      callback: { action: 'category', id: 'c-1', revision: 'rev-income' },
    });
    expect(prisma.financeCategory.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          profileId: input.profileId,
          type: 'INCOME',
          archivedAt: null,
        }),
      }),
    );
  });

  it('supports skip description, Back, and Cancel without losing the revision', async () => {
    const payload = {
      type: 'INCOME',
      revision: 'rev-1',
      accountId: 'a-1',
      amount: '10',
      categoryId: 'c-1',
    };
    prisma.financeChatFlow.findUnique
      .mockResolvedValueOnce({
        id: 'flow-1',
        profileId: input.profileId,
        operationKind: 'TRANSACTION_CREATE',
        status: 'ACTIVE',
        step: 'TRANSACTION_DESCRIPTION',
        payload,
        expiresAt: future,
      })
      .mockResolvedValueOnce({
        id: 'flow-1',
        profileId: input.profileId,
        operationKind: 'TRANSACTION_CREATE',
        status: 'ACTIVE',
        step: 'TRANSACTION_REVIEW',
        payload: { ...payload, description: null },
        expiresAt: future,
      })
      .mockResolvedValueOnce({
        id: 'flow-1',
        profileId: input.profileId,
        operationKind: 'TRANSACTION_CREATE',
        status: 'ACTIVE',
        step: 'TRANSACTION_DESCRIPTION',
        payload,
        expiresAt: future,
      });
    prisma.financeChatFlow.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.consumeCallback({
        ...input,
        callback: { action: 'skip', revision: 'rev-1' },
      }),
    ).resolves.toMatchObject({
      kind: 'review',
      step: 'TRANSACTION_REVIEW',
      payload: { description: null, revision: 'rev-1' },
    });
    await expect(
      service.consumeCallback({
        ...input,
        callback: { action: 'back', revision: 'rev-1' },
      }),
    ).resolves.toMatchObject({
      kind: 'prompt',
      step: 'TRANSACTION_DESCRIPTION',
    });
    await expect(
      service.consumeCallback({
        ...input,
        callback: { action: 'cancel', revision: 'rev-1' },
      }),
    ).resolves.toMatchObject({ kind: 'cancelled' });
  });

  it('rejects a callback from an older flow generation', async () => {
    prisma.financeChatFlow.findUnique.mockResolvedValue({
      id: 'flow-1',
      profileId: input.profileId,
      operationKind: 'TRANSACTION_CREATE',
      status: 'ACTIVE',
      step: 'TRANSACTION_ACCOUNT',
      payload: { type: 'EXPENSE', revision: 'current' },
      expiresAt: future,
    });

    await expect(
      service.consumeCallback({
        ...input,
        callback: { action: 'account', id: 'a-1', revision: 'old' },
      }),
    ).resolves.toEqual({
      kind: 'invalid',
      flow: 'TRANSACTION_CREATE',
      reason: 'selection',
    });
    expect(prisma.financeChatFlow.update).not.toHaveBeenCalled();
  });

  it('reconciles a creating transaction by its reserved result id without writing twice', async () => {
    prisma.financeChatFlow.findUnique.mockResolvedValue({
      id: 'flow-1',
      profileId: input.profileId,
      operationKind: 'TRANSACTION_CREATE',
      status: 'CREATING',
      step: 'TRANSACTION_REVIEW',
      payload: {
        type: 'EXPENSE',
        revision: 'rev-1',
        resultId: 'tx-reserved',
        accountId: 'a-1',
        amount: '12.50',
        occurredAt: '2026-01-01T00:00:00.000Z',
      },
      expiresAt: future,
    });
    prisma.financeTransaction.findFirst.mockResolvedValue({
      id: 'tx-reserved',
    });

    await expect(
      service.consumeCallback({
        ...input,
        callback: { action: 'confirm', revision: 'rev-1' },
      }),
    ).resolves.toMatchObject({
      kind: 'created',
      flow: 'TRANSACTION_CREATE',
      id: 'tx-reserved',
    });
    expect(ledger.createTransaction).not.toHaveBeenCalled();
    expect(prisma.financeChatFlow.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'flow-1', status: 'CREATING' },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
  });

  it('archives a category only after explicit confirmation', async () => {
    core.categories.mockResolvedValue([
      { id: 'category-1', name: 'Coffee', type: 'EXPENSE', archivedAt: null },
    ]);
    core.archiveCategory.mockResolvedValue({ id: 'category-1' });
    const review = await service.startCategoryArchive({
      ...input,
      categoryId: 'category-1',
    });
    expect(review).toMatchObject({
      kind: 'review',
      flow: 'CATEGORY_ARCHIVE',
      payload: { entityId: 'category-1' },
    });
    const revision =
      review && 'payload' in review ? review.payload.revision : undefined;
    prisma.financeChatFlow.findUnique.mockResolvedValue({
      id: 'flow-1',
      profileId: input.profileId,
      operationKind: 'CATEGORY_ARCHIVE',
      status: 'ACTIVE',
      step: 'CATEGORY_ARCHIVE_REVIEW',
      payload: { entityId: 'category-1', revision },
      expiresAt: future,
    });
    prisma.financeChatFlow.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.consumeCallback({
        ...input,
        callback: { action: 'confirm', revision: revision || undefined },
      }),
    ).resolves.toMatchObject({
      kind: 'updated',
      flow: 'CATEGORY_ARCHIVE',
      id: 'category-1',
    });
    expect(core.archiveCategory).toHaveBeenCalledWith(
      input.profileId,
      'category-1',
    );
  });

  it('reconciles a category archive that committed before flow completion', async () => {
    prisma.financeCategory.findFirst.mockResolvedValue({
      id: 'category-1',
      archivedAt: new Date(),
    });
    prisma.financeChatFlow.findUnique.mockResolvedValue({
      id: 'flow-1',
      profileId: input.profileId,
      operationKind: 'CATEGORY_ARCHIVE',
      status: 'CREATING',
      step: 'CATEGORY_ARCHIVE_REVIEW',
      payload: { entityId: 'category-1', revision: 'rev-archive' },
      expiresAt: future,
    });

    await expect(
      service.consumeCallback({
        ...input,
        callback: { action: 'confirm', revision: 'rev-archive' },
      }),
    ).resolves.toMatchObject({ kind: 'updated', id: 'category-1' });
    expect(core.archiveCategory).not.toHaveBeenCalled();
  });

  it('edits only supported account fields and reviews after name and type', async () => {
    const row = (step: string, payload: object) => ({
      id: 'flow-1',
      profileId: input.profileId,
      operationKind: 'ACCOUNT_EDIT',
      status: 'ACTIVE',
      step,
      payload,
      expiresAt: future,
    });
    prisma.financeChatFlow.findUnique
      .mockResolvedValueOnce(
        row('ACCOUNT_NAME', {
          entityId: 'a-1',
          revision: 'rev-edit',
          name: 'Old',
          type: 'CARD',
        }),
      )
      .mockResolvedValueOnce(
        row('ACCOUNT_TYPE', {
          entityId: 'a-1',
          revision: 'rev-edit',
          name: 'Daily',
          type: 'CARD',
        }),
      )
      .mockResolvedValueOnce(
        row('ACCOUNT_EMOJI', {
          entityId: 'a-1',
          revision: 'rev-edit',
          name: 'Daily',
          type: 'CASH',
        }),
      )
      .mockResolvedValueOnce(
        row('ACCOUNT_REVIEW', {
          entityId: 'a-1',
          revision: 'rev-edit',
          name: 'Daily',
          type: 'CASH',
          emoji: '💵',
        }),
      );
    prisma.financeChatFlow.updateMany.mockResolvedValue({ count: 1 });
    core.updateAccount.mockResolvedValue({ id: 'a-1' });

    await expect(
      service.consumeText({ ...input, text: 'Daily' }),
    ).resolves.toMatchObject({ step: 'ACCOUNT_TYPE' });
    await expect(
      service.consumeCallback({
        ...input,
        callback: { action: 'type', id: 'CASH', revision: 'rev-edit' },
      }),
    ).resolves.toMatchObject({ kind: 'prompt', step: 'ACCOUNT_EMOJI' });
    await expect(
      service.consumeCallback({
        ...input,
        callback: { action: 'emoji', id: '💵', revision: 'rev-edit' },
      }),
    ).resolves.toMatchObject({ kind: 'review', step: 'ACCOUNT_REVIEW' });
    await expect(
      service.consumeCallback({
        ...input,
        callback: { action: 'confirm', revision: 'rev-edit' },
      }),
    ).resolves.toMatchObject({ kind: 'updated', id: 'a-1' });
    expect(core.updateAccount).toHaveBeenCalledWith(input.profileId, 'a-1', {
      name: 'Daily',
      type: 'CASH',
      emoji: '💵',
    });
  });

  it('expires lazily and never writes financial data for an expired flow', async () => {
    prisma.financeChatFlow.findUnique.mockResolvedValue({
      id: 'flow-1',
      ...input,
      operationKind: 'TRANSACTION_CREATE',
      status: 'ACTIVE',
      step: 'TRANSACTION_REVIEW',
      payload: {},
      expiresAt: new Date(Date.now() - 1),
    });
    await expect(
      service.consumeCallback({ ...input, callback: { action: 'confirm' } }),
    ).resolves.toEqual({ kind: 'expired', flow: 'TRANSACTION_CREATE' });
    expect(prisma.financeChatFlow.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'EXPIRED' } }),
    );
    expect(ledger.createTransaction).not.toHaveBeenCalled();
  });
});
