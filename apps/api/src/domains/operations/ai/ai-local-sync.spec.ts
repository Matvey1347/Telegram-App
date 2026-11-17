/* In-memory database models implement transaction rollback and exact Decimal counters. */
import { Prisma, type AiOperation } from '@prisma/client';
import { syncAiOperation, sameAiReceipt } from './ai-local-sync';
const decimal = (value: string | number) => new Prisma.Decimal(value);
function operation(overrides: Partial<AiOperation> = {}): AiOperation {
  return {
    id: 'local-row',
    workspaceId: 'local-workspace',
    source: 'LOCAL_UNSYNCED',
    operationId: 'logical-request',
    actorUserId: 'actor',
    category: 'CONTENT',
    provider: 'OPENAI',
    model: 'model',
    providerModel: 'model',
    mode: 'MANUAL',
    fingerprint: 'fingerprint',
    status: 'SUCCEEDED',
    pricingStatus: 'PRICED',
    reservedCost: decimal('0.02'),
    actualCost: decimal('0.012345678901'),
    currency: 'USD',
    inputTokens: 12,
    outputTokens: 4,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: 16,
    durationMs: 10,
    audioDurationSeconds: null,
    errorCategory: null,
    providerRequestId: 'provider-receipt',
    businessObjectId: null,
    aiPostingChannelId: null,
    aiPostingTestRunId: null,
    aiPostingAutopilotRunId: null,
    aiPostingPublicationIndex: null,
    aiPostingAttempt: null,
    aiPostingMode: null,
    aiPostingManagedPostId: null,
    configurationSnapshot: { nested: { key: 'value' } },
    pricingSnapshot: { price: '0.01' },
    pricingVersion: null,
    pricingEffectiveAt: null,
    reconciliationReference: null,
    reconciledByUserId: null,
    deadlineAt: new Date('2026-10-04T10:00Z'),
    expiresAt: new Date('2027-01-01'),
    finishedAt: new Date('2026-10-04T10:00Z'),
    createdAt: new Date('2026-10-04T09:59Z'),
    ...overrides,
  } as AiOperation;
}
function database(initial?: AiOperation) {
  let row = initial;
  let knownCost = decimal(initial?.actualCost?.toString() ?? '0');
  let requestCount = initial ? 1 : 0;
  let budgets = new Map<
    string,
    { spent: Prisma.Decimal; reserved: Prisma.Decimal }
  >();
  let failCommit = false;
  const tx = {
    $executeRaw: jest.fn(),
    aiOperation: {
      findUnique: async () => row,
      findUniqueOrThrow: async () => {
        if (!row) throw Error('missing');
        return row;
      },
      create: async ({ data }: { data: AiOperation }) => {
        row = data;
        return row;
      },
      update: async ({ data }: { data: Partial<AiOperation> }) => {
        row = { ...row!, ...data };
        return row;
      },
    },
    aiUsageDaily: {
      upsert: async ({ create, update }: any) => {
        const change = update.knownCost.increment;
        knownCost = knownCost.add(change);
        requestCount += create.requests;
      },
      update: async ({ data }: any) => {
        knownCost = knownCost.add(data.knownCost.increment);
        requestCount += data.requests.increment;
      },
    },
    aiBudgetPeriod: {
      upsert: async ({ create, update }: any) => {
        const key = `${create.scope}:${create.period}`;
        const previous = budgets.get(key);
        budgets.set(
          key,
          previous
            ? {
                spent: previous.spent.add(update.spent.increment),
                reserved: previous.reserved.add(update.reserved.increment),
              }
            : {
                spent: decimal(create.spent.toString()),
                reserved: decimal(create.reserved.toString()),
              },
        );
      },
      update: async ({ where, data }: any) => {
        const key = `${where.workspaceId_scope_period_periodStart.scope}:${where.workspaceId_scope_period_periodStart.period}`;
        const previous = budgets.get(key)!;
        budgets.set(key, {
          spent: previous.spent.add(data.spent.increment),
          reserved: previous.reserved.add(data.reserved.increment),
        });
      },
    },
  };
  return {
    client: {
      ...tx,
      $transaction: async (
        callback: (client: typeof tx) => Promise<unknown>,
      ) => {
        const before = {
          row,
          knownCost,
          requestCount,
          budgets: new Map(budgets),
        };
        try {
          const result = await callback(tx);
          if (failCommit) throw Error('lost commit');
          return result;
        } catch (error) {
          row = before.row;
          knownCost = before.knownCost;
          requestCount = before.requestCount;
          budgets = before.budgets;
          throw error;
        }
      },
    } as never,
    fail: (value: boolean) => {
      failCommit = value;
    },
    row: () => row!,
    cost: () => knownCost.toFixed(12),
    requests: () => requestCount,
    budget: () => budgets.get('WORKSPACE:DAY')!,
  };
}

describe('local AI receipt synchronization', () => {
  it('imports exact historical cost once, maps workspace, and never copies the local row ID', async () => {
    const receipt = operation();
    const local = database(receipt);
    const production = database();
    await syncAiOperation(
      local.client,
      production.client,
      receipt,
      'production-workspace',
    );
    expect(production.row().id).not.toBe(receipt.id);
    expect(production.row().workspaceId).toBe('production-workspace');
    expect(production.row().createdAt).toEqual(receipt.createdAt);
    expect(production.cost()).toBe('0.012345678901');
    expect(production.budget().spent.toFixed(12)).toBe('0.012345678901');
    await syncAiOperation(
      local.client,
      production.client,
      receipt,
      'production-workspace',
    );
    expect(production.requests()).toBe(1);
    expect(local.row().source).toBe('LOCAL_SYNCED');
    expect(local.cost()).toBe('0.012345678901');
  });
  it('rolls production aggregates back on failure and retains the local receipt', async () => {
    const receipt = operation();
    const local = database(receipt);
    const production = database();
    production.fail(true);
    await expect(
      syncAiOperation(
        local.client,
        production.client,
        receipt,
        'production-workspace',
      ),
    ).rejects.toThrow();
    expect(local.row().source).toBe('LOCAL_UNSYNCED');
    expect(production.requests()).toBe(0);
    production.fail(false);
    await syncAiOperation(
      local.client,
      production.client,
      receipt,
      'production-workspace',
    );
    expect(production.requests()).toBe(1);
  });
  it('recovers from production commit followed by failed local acknowledgement without double spend', async () => {
    const receipt = operation();
    const local = database(receipt);
    const production = database();
    local.fail(true);
    await expect(
      syncAiOperation(
        local.client,
        production.client,
        receipt,
        'production-workspace',
      ),
    ).rejects.toThrow();
    expect(local.row().source).toBe('LOCAL_UNSYNCED');
    expect(production.requests()).toBe(1);
    local.fail(false);
    await syncAiOperation(
      local.client,
      production.client,
      receipt,
      'production-workspace',
    );
    expect(production.requests()).toBe(1);
    expect(production.cost()).toBe('0.012345678901');
  });
  it('imports UNKNOWN reserve and replaces it with reconciled spent exactly once', async () => {
    const receipt = operation({ status: 'UNKNOWN', actualCost: null });
    const local = database(receipt);
    const production = database();
    await syncAiOperation(
      local.client,
      production.client,
      receipt,
      'production-workspace',
    );
    expect(production.budget().spent.toString()).toBe('0');
    expect(production.budget().reserved.toString()).toBe('0.02');
    const resolved = operation({
      status: 'RECONCILED',
      reconciliationReference: 'provider-bill',
    });
    const settledLocal = database(resolved);
    await syncAiOperation(
      settledLocal.client,
      production.client,
      resolved,
      'production-workspace',
    );
    expect(production.requests()).toBe(1);
    expect(production.cost()).toBe('0.012345678901');
    expect(production.budget().reserved.toString()).toBe('0');
    expect(production.budget().spent.toFixed(12)).toBe('0.012345678901');
  });
  it('detects nested receipt conflicts instead of acknowledging a colliding operationId', async () => {
    const receipt = operation();
    const other = operation({
      configurationSnapshot: { nested: { key: 'different' } },
    });
    expect(sameAiReceipt(receipt, other)).toBe(false);
    const local = database(receipt);
    const production = database(other);
    await expect(
      syncAiOperation(
        local.client,
        production.client,
        receipt,
        'production-workspace',
      ),
    ).rejects.toThrow('Conflicting');
    expect(local.row().source).toBe('LOCAL_UNSYNCED');
  });
});
