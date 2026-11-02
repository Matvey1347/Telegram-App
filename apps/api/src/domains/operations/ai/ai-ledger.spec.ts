/* In-memory transport/transaction mocks intentionally implement only exercised Prisma/fetch branches. */
/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await */
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  AiAdmissionService,
  type AiExecutionRequest,
} from './ai-admission.service';
import { AiModelRegistry } from './ai-model-registry';
import { AiSettlementService } from './ai-settlement.service';
import { AiGateway } from './ai-gateway';
import { AiLocalConcurrency } from './ai-local-concurrency';

const decimal = (n: string) => new Prisma.Decimal(n);
function harness() {
  const registry = new AiModelRegistry();
  const config = {
    ...registry.category('LEAD_AD_CLASSIFICATION'),
    enabled: true,
    dailyBudget: decimal('1'),
    monthlyBudget: decimal('1'),
    maxRequestCost: decimal('1'),
    version: 1,
  };
  const workspace = {
    enabled: true,
    automaticEnabled: false,
    dailyBudget: decimal('0.0015'),
    monthlyBudget: decimal('1'),
    maxRequestCost: decimal('1'),
  };
  const operations: any[] = [],
    buckets = new Map<string, any>();
  const tx: any = {
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(async () => [
      {
        count: BigInt(
          operations.filter(
            (o) =>
              o.configurationSnapshot?.promptVersion === 'lead-media-vision-v1',
          ).length,
        ),
        committed: operations
          .filter(
            (o) =>
              o.configurationSnapshot?.promptVersion === 'lead-media-vision-v1',
          )
          .reduce(
            (sum, o) => sum.add(o.actualCost ?? o.reservedCost),
            decimal('0'),
          ),
      },
    ]),
    aiWorkspaceConfig: { findUnique: jest.fn(async () => workspace) },
    aiCategoryConfig: { findUnique: jest.fn(async () => config) },
    aiOperation: {
      findUnique: jest.fn(
        async ({ where }) =>
          operations.find(
            (o) =>
              o.workspaceId === where.workspaceId_operationId.workspaceId &&
              o.operationId === where.workspaceId_operationId.operationId,
          ) ?? null,
      ),
      findUniqueOrThrow: jest.fn(async ({ where }) =>
        operations.find((o) => o.id === where.id),
      ),
      findFirst: jest.fn(async ({ where }) =>
        operations.find(
          (o) => o.id === where.id && o.workspaceId === where.workspaceId,
        ),
      ),
      count: jest.fn(
        async ({ where }) =>
          operations.filter(
            (o) =>
              o.workspaceId === where.workspaceId &&
              (!where.category || where.category === o.category) &&
              (typeof where.status === 'string'
                ? o.status === where.status
                : where.status.in.includes(o.status)) &&
              (!where.deadlineAt || o.deadlineAt > where.deadlineAt.gt),
          ).length,
      ),
      create: jest.fn(async ({ data }) => {
        const row = {
          id: randomUUID(),
          actualCost: null,
          providerModel: null,
          providerRequestId: null,
          finishedAt: null,
          durationMs: null,
          errorCategory: null,
          pricingEffectiveAt: null,
          inputTokens: null,
          outputTokens: null,
          cachedInputTokens: null,
          cacheWriteTokens: null,
          reasoningTokens: null,
          totalTokens: null,
          ...data,
        };
        operations.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }) => {
        const row = operations.find((o) => o.id === where.id);
        Object.assign(row, data);
        return { ...row };
      }),
    },
    aiBudgetPeriod: {
      upsert: jest.fn(async ({ where, create }) => {
        const key = JSON.stringify(where);
        if (!buckets.has(key))
          buckets.set(key, {
            id: key,
            spent: decimal('0'),
            reserved: decimal('0'),
            ...create,
          });
        return buckets.get(key);
      }),
      update: jest.fn(async ({ where, data }) => {
        const row = where.id
          ? buckets.get(where.id)
          : buckets.get(JSON.stringify(where));
        if (data.reserved?.increment)
          row.reserved = row.reserved.add(data.reserved.increment);
        if (data.reserved?.decrement)
          row.reserved = row.reserved.sub(data.reserved.decrement);
        if (data.spent?.increment)
          row.spent = row.spent.add(data.spent.increment);
        return row;
      }),
    },
    aiUsageDaily: {
      upsert: jest.fn(async () => ({})),
      update: jest.fn(async () => ({})),
    },
  };
  let tail = Promise.resolve();
  const prisma: any = {
    $transaction: (fn: any) => {
      const pending = tail.then(() => fn(tx));
      tail = pending.catch(() => undefined);
      return pending;
    },
  };
  const auth: any = { require: jest.fn(async () => ({ workspaceId: 'ws' })) };
  const admission = new AiAdmissionService(prisma, registry, {
    enabled: true,
    configured: true,
  } as any);
  const settlement = new AiSettlementService(prisma, auth);
  const request = (): AiExecutionRequest => ({
    userId: 'user',
    workspaceId: 'ws',
    category: 'LEAD_AD_CLASSIFICATION',
    operationId: `${new Date().toISOString().slice(0, 10)}:${randomUUID()}`,
    mode: 'MANUAL',
    input: 'private content',
  });
  return {
    tx,
    registry,
    workspace,
    config,
    operations,
    buckets,
    prisma,
    auth,
    admission,
    settlement,
    request,
  };
}

describe('AI locked admission and settlement', () => {
  it('blocks a 31st media operation even when budget remains', async () => {
    const h = harness();
    h.tx.$queryRaw.mockResolvedValue([
      { count: BigInt(30), committed: decimal('0.10') },
    ]);
    await expect(
      h.admission.admit({
        ...h.request(),
        businessObjectId: 'item',
        durableVersion: 'lead-media-vision-v1',
        mediaPilotSourceId: 'source',
        image: { mime: 'image/jpeg', data: Buffer.from([255, 216, 255, 1]) },
      }),
    ).rejects.toThrow('AI_MEDIA_PILOT_BUDGET_EXHAUSTED');
    expect(h.operations).toHaveLength(0);
  });
  it('reserves once for a vision payload and rejects changed image bytes on replay', async () => {
    const h = harness();
    const request: AiExecutionRequest = {
      ...h.request(),
      businessObjectId: 'observation',
      durableVersion: 'lead-media-vision-v1',
      mediaPilotSourceId: 'source',
      image: { mime: 'image/jpeg', data: Buffer.from([255, 216, 255, 10, 11]) },
    };
    const first = await h.admission.admit(request);
    const repeated = await h.admission.admit(request);
    expect([first.replayed, repeated.replayed]).toEqual([false, true]);
    expect(h.operations).toHaveLength(1);
    expect(JSON.stringify(h.operations)).not.toContain('255,216,255,10,11');
    await expect(
      h.admission.admit({
        ...request,
        image: { mime: 'image/jpeg', data: Buffer.from([255, 216, 255, 12]) },
      }),
    ).rejects.toThrow('AI_OPERATION_CONFLICT');
  });
  it('serializes duplicate IDs and rejects changed payload without persisting content', async () => {
    const h = harness(),
      request = h.request();
    const admitted = await Promise.all([
      h.admission.admit(request),
      h.admission.admit(request),
    ]);
    expect(admitted.map((x) => x.replayed)).toEqual([false, true]);
    expect(h.operations).toHaveLength(1);
    expect(JSON.stringify(h.operations)).not.toContain('private content');
    expect(h.buckets.size).toBe(4);
    await expect(
      h.admission.admit({ ...request, input: 'different' }),
    ).rejects.toThrow('AI_OPERATION_CONFLICT');
  });
  it('concurrent distinct admissions cannot spend the same budget', async () => {
    const h = harness();
    const results = await Promise.allSettled([
      h.admission.admit(h.request()),
      h.admission.admit(h.request()),
    ]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
    expect(h.operations).toHaveLength(1);
  });
  it('bounds live category requests separately from unresolved expired requests', async () => {
    const h = harness();
    h.workspace.dailyBudget = decimal('1');
    const admitted = await h.admission.admit(h.request());
    await h.admission.admit(h.request());
    await expect(h.admission.admit(h.request())).rejects.toThrow(
      'AI_CAPACITY_EXHAUSTED',
    );
    admitted.operation.deadlineAt = new Date(Date.now() - 1);
    await h.admission.admit(h.request());
    expect(h.operations).toHaveLength(3);
    for (const row of h.operations) row.deadlineAt = new Date(0);
    while (h.operations.length < 32)
      h.operations.push({
        ...admitted.operation,
        id: randomUUID(),
        operationId: randomUUID(),
        status: 'UNKNOWN',
      });
    await expect(h.admission.admit(h.request())).rejects.toThrow(
      'AI_CAPACITY_EXHAUSTED',
    );
  });
  it('holds actual usage with unsupported cache writes and only reconciles expired RUNNING', async () => {
    const h = harness();
    h.workspace.dailyBudget = decimal('1');
    h.config.modelId = 'gpt-5.4-mini-2026-03-17';
    const admitted = await h.admission.admit(h.request());
    await expect(
      h.settlement.reconcile('admin', admitted.operation.id, {
        actualCost: '0',
        evidence: 'audit:early',
      }),
    ).rejects.toThrow('AI_RECONCILIATION_NOT_ALLOWED');
    const settled = await h.settlement.settle(admitted.operation, {
      generationStarted: true,
      usage: {
        inputTokens: 10,
        outputTokens: 1,
        cachedInputTokens: 0,
        cacheWriteTokens: 1,
        reasoningTokens: 0,
        totalTokens: 11,
      },
      errorCategory: null,
      providerModel: 'gpt-5.4-mini-2026-03-17',
      providerRequestId: 'req_safe',
    });
    expect(settled).toMatchObject({
      status: 'UNKNOWN',
      pricingStatus: 'UNPRICED',
      actualCost: null,
      cacheWriteTokens: 1,
    });
    expect(
      [...h.buckets.values()].every((b) =>
        b.reserved.eq(admitted.operation.reservedCost),
      ),
    ).toBe(true);
  });
  it('does not freshly execute old, future or deleted operation keys', async () => {
    const h = harness();
    for (const date of ['2020-01-01', '2099-01-01'])
      await expect(
        h.admission.admit({
          ...h.request(),
          operationId: `${date}:${randomUUID()}`,
        }),
      ).rejects.toThrow('AI_OPERATION_DATE_INVALID');
    expect(h.operations).toHaveLength(0);
  });
  it('disables automatic calls unless both flags and category budgets are explicit', async () => {
    const h = harness();
    await expect(
      h.admission.admit({ ...h.request(), mode: 'AUTOMATIC' }),
    ).rejects.toThrow('AI_AUTOMATIC_DISABLED');
    h.workspace.enabled = false;
    await expect(h.admission.admit(h.request())).rejects.toThrow('AI_DISABLED');
  });
  it('holds missing usage, manually reconciles four periods once and retracts UNKNOWN rollup', async () => {
    const h = harness(),
      admitted = await h.admission.admit(h.request());
    const unknown = await h.settlement.settle(admitted.operation, {
      generationStarted: true,
      usage: null,
      errorCategory: 'TIMEOUT',
      providerModel: null,
      providerRequestId: null,
    });
    expect(unknown).toMatchObject({ status: 'UNKNOWN', actualCost: null });
    expect([...h.buckets.values()].every((b) => b.reserved.eq('0.0015'))).toBe(
      true,
    );
    const reconciled = await h.settlement.reconcile('admin', unknown.id, {
      actualCost: '0.002',
      evidence: 'invoice:verified_123',
    });
    expect(reconciled).toMatchObject({
      status: 'RECONCILED',
      pricingStatus: 'MANUAL',
      inputTokens: null,
    });
    expect(
      [...h.buckets.values()].every(
        (b) => b.reserved.eq(0) && b.spent.eq('0.002'),
      ),
    ).toBe(true);
    expect(h.tx.aiUsageDaily.upsert).toHaveBeenCalledTimes(2);
    expect(h.tx.aiUsageDaily.update).toHaveBeenCalledTimes(1);
    await expect(
      h.settlement.reconcile('admin', unknown.id, {
        actualCost: '0',
        evidence: 'audit:twice',
      }),
    ).rejects.toThrow('AI_RECONCILIATION_NOT_ALLOWED');
    await expect(h.admission.admit(h.request())).rejects.toThrow(
      'AI_BUDGET_EXHAUSTED',
    );
  });
  it('releases only known-before-generation failures without fake zero cost', async () => {
    const h = harness(),
      admitted = await h.admission.admit(h.request());
    expect(
      await h.settlement.settle(admitted.operation, {
        generationStarted: false,
        usage: null,
        errorCategory: 'INPUT_TOKEN_LIMIT',
        providerModel: null,
        providerRequestId: null,
      }),
    ).toMatchObject({
      status: 'FAILED',
      pricingStatus: 'NOT_SENT',
      actualCost: null,
    });
    expect(
      [...h.buckets.values()].every((b) => b.reserved.eq(0) && b.spent.eq(0)),
    ).toBe(true);
  });
  it('prices failed structured output with usage and records cost overruns', async () => {
    const h = harness(),
      admitted = await h.admission.admit(h.request());
    const settled = await h.settlement.settle(admitted.operation, {
      generationStarted: true,
      usage: {
        inputTokens: 32000,
        outputTokens: 8000,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        totalTokens: 40000,
      },
      errorCategory: 'OUTPUT_SCHEMA_INVALID',
      providerModel: 'gpt-6-luna',
      providerRequestId: 'req_x',
    });
    expect(settled.status).toBe('FAILED');
    expect(settled.actualCost?.gt(settled.reservedCost)).toBe(true);
    expect(
      [...h.buckets.values()].every(
        (b) => b.spent.eq('0.0072') && b.reserved.eq(0),
      ),
    ).toBe(true);
  });
  it('rejects nonreference reconciliation evidence and another workspace', async () => {
    const h = harness();
    await expect(
      h.settlement.reconcile('admin', 'missing', {
        actualCost: '0',
        evidence: 'customer text',
      }),
    ).rejects.toThrow('AI_RECONCILIATION_INVALID');
    await expect(
      h.settlement.reconcile('admin', 'missing', {
        actualCost: '0',
        evidence: 'audit:valid',
      }),
    ).rejects.toThrow('AI_OPERATION_NOT_FOUND');
  });
});

describe('AI gateway authorization and failure idempotency', () => {
  it('enforces workspace and sales permissions before admission, with Support isolated', async () => {
    const h = harness(),
      provider: any = { execute: jest.fn() };
    const gateway = new AiGateway(
      h.auth,
      h.admission,
      new AiLocalConcurrency(),
      provider,
      h.settlement,
    );
    await expect(
      gateway.execute({ ...h.request(), workspaceId: 'other' }),
    ).rejects.toThrow('AI_WORKSPACE_MISMATCH');
    h.auth.require.mockImplementation(async (_u, permission) => {
      if (permission === 'adSales.crm.view') throw new Error('denied');
      return { workspaceId: 'ws' };
    });
    await expect(gateway.execute(h.request())).rejects.toThrow('denied');
    expect(provider.execute).not.toHaveBeenCalled();
    provider.execute.mockResolvedValue({
      generationStarted: false,
      usage: null,
      errorCategory: 'INPUT_TOKEN_LIMIT',
      providerModel: null,
      providerRequestId: null,
    });
    h.auth.require.mockClear();
    await gateway.execute({ ...h.request(), category: 'SUPPORT_ASSISTANT' });
    expect(
      h.auth.require.mock.calls.map(([, permission]) => permission),
    ).toEqual(['operations.executeAi']);
  });
  it('never repeats provider work after settlement DB failure and returns metadata-only replay', async () => {
    const h = harness(),
      provider: any = {
        execute: jest.fn(async () => ({
          generationStarted: true,
          usage: null,
          errorCategory: 'TIMEOUT',
          providerModel: null,
          providerRequestId: null,
        })),
      };
    const settlement: any = {
      settle: jest.fn(async () => {
        throw new Error('db failure secret');
      }),
    };
    const gateway = new AiGateway(
        h.auth,
        h.admission,
        new AiLocalConcurrency(),
        provider,
        settlement,
      ),
      request = h.request();
    await expect(gateway.execute(request)).rejects.toThrow(
      'AI_SETTLEMENT_UNCERTAIN',
    );
    expect(await gateway.execute(request)).toMatchObject({
      replayed: true,
      operation: { status: 'RUNNING' },
    });
    expect(provider.execute).toHaveBeenCalledTimes(1);
    expect([...h.buckets.values()].every((b) => b.reserved.eq('0.0015'))).toBe(
      true,
    );
  });
});

describe('configured input ceiling integration', () => {
  it('accepts the exact32768 configuration ceiling rather than a divergent32000 guard', async () => {
    const h = harness();
    h.config.maxInputTokens = 32768;
    h.workspace.dailyBudget = decimal('1');
    const admitted = await h.admission.admit(h.request());
    expect(admitted.replayed).toBe(false);
    expect(admitted.config.maxInputTokens).toBe(32768);
    expect(h.operations).toHaveLength(1);
  });
});
