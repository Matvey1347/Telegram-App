/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await -- focused Prisma test double */
import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  TelegramSystemBotWorkflowKind,
  TelegramSystemBotWorkflowStatus,
} from '@prisma/client';
import { TelegramSystemBotWorkflowStore } from './telegram-system-bot-workflow.store';

const scope = { connectionId: 'connection-1', workspaceId: 'workspace-1' };

function workflow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'workflow-1',
    ...scope,
    kind: TelegramSystemBotWorkflowKind.POST_IMPORT,
    step: 'CHANNEL',
    status: TelegramSystemBotWorkflowStatus.ACTIVE,
    version: 1,
    payload: {},
    expiresAt: new Date(Date.now() + 60_000),
    updatedAt: new Date(),
    ...overrides,
  };
}

function setup() {
  const prisma = {
    telegramSystemBotWorkflow: {
      create: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    telegramSystemBotFinanceDraft: { findFirst: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn((work: (tx: unknown) => unknown) => work(prisma)),
  } as any;
  return {
    prisma,
    store: new TelegramSystemBotWorkflowStore(prisma),
  };
}

describe('TelegramSystemBotWorkflowStore', () => {
  it('serializes concurrent workflow creation and permits only one active slot', async () => {
    let active = false;
    let queue = Promise.resolve<unknown>(undefined);
    const prisma = {
      $queryRaw: jest.fn(),
      telegramSystemBotFinanceDraft: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      telegramSystemBotWorkflow: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn(async () => (active ? { id: 'active-1' } : null)),
        create: jest.fn(async ({ data }: { data: object }) => {
          active = true;
          return { id: 'created-1', ...data };
        }),
      },
      $transaction: jest.fn((work: (tx: unknown) => Promise<unknown>) => {
        const result = queue.then(() => work(prisma));
        queue = result.catch(() => undefined);
        return result;
      }),
    };
    const store = new TelegramSystemBotWorkflowStore(prisma as never);
    const input = {
      ...scope,
      kind: TelegramSystemBotWorkflowKind.POST_BATCH_IMPORT,
      step: 'AWAIT_CONTENT',
      payload: {},
      expiresAt: new Date(Date.now() + 60_000),
    };

    const results = await Promise.allSettled([
      store.create(input),
      store.create(input),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(prisma.telegramSystemBotWorkflow.create).toHaveBeenCalledTimes(1);
  });

  it('blocks another import while a post batch capture is active', async () => {
    const { prisma, store } = setup();
    prisma.telegramSystemBotWorkflow.findFirst.mockResolvedValue(
      workflow({ kind: TelegramSystemBotWorkflowKind.POST_BATCH_IMPORT }),
    );

    await expect(store.requireNoActiveBatchImport(scope)).rejects.toMatchObject(
      {
        response: expect.objectContaining({
          code: 'TELEGRAM_SYSTEM_BOT_IMPORT_ACTIVE',
        }),
      },
    );
    expect(prisma.telegramSystemBotWorkflow.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ...scope,
          kind: TelegramSystemBotWorkflowKind.POST_BATCH_IMPORT,
        }),
      }),
    );
  });

  it('blocks batch capture for active single, mutual, or Ad Sale content flows', async () => {
    const { prisma, store } = setup();
    prisma.telegramSystemBotWorkflow.findFirst.mockResolvedValue(
      workflow({ kind: TelegramSystemBotWorkflowKind.AD_SALE }),
    );

    await expect(
      store.requireNoActiveOutsideBatchImport(scope),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.telegramSystemBotWorkflow.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ...scope,
          kind: {
            in: [
              TelegramSystemBotWorkflowKind.POST_IMPORT,
              TelegramSystemBotWorkflowKind.MUTUAL_PROMOTION_POST,
              TelegramSystemBotWorkflowKind.AD_SALE,
              TelegramSystemBotWorkflowKind.WORKSPACE_SETTINGS,
            ],
          },
        }),
      }),
    );
  });

  it('discovers a completed unconsumed batch import within its workspace', async () => {
    const { prisma, store } = setup();
    const completed = workflow({
      id: 'completed-1',
      kind: TelegramSystemBotWorkflowKind.POST_BATCH_IMPORT,
      status: TelegramSystemBotWorkflowStatus.COMPLETED,
    });
    prisma.telegramSystemBotWorkflow.findFirst.mockResolvedValue(null);
    prisma.telegramSystemBotWorkflow.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(completed);

    await expect(store.recoverableBatchImport(scope)).resolves.toBe(completed);
    expect(prisma.telegramSystemBotWorkflow.findFirst.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          ...scope,
          status: {
            in: [
              TelegramSystemBotWorkflowStatus.COMMITTING,
              TelegramSystemBotWorkflowStatus.COMPLETED,
            ],
          },
          postBatch: { is: null },
        }),
      }),
    );
  });

  it('repairs a committing unconsumed batch import instead of creating another workflow', async () => {
    const { prisma, store } = setup();
    const committing = workflow({
      id: 'committing-1',
      kind: TelegramSystemBotWorkflowKind.POST_BATCH_IMPORT,
      status: TelegramSystemBotWorkflowStatus.COMMITTING,
      version: 4,
    });
    const completed = {
      ...committing,
      status: TelegramSystemBotWorkflowStatus.COMPLETED,
      version: 5,
    };
    prisma.telegramSystemBotWorkflow.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(committing)
      .mockResolvedValueOnce(completed);
    prisma.telegramSystemBotWorkflow.updateMany.mockResolvedValue({ count: 1 });

    await expect(store.recoverableBatchImport(scope)).resolves.toEqual(
      completed,
    );
    expect(prisma.telegramSystemBotWorkflow.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'committing-1',
          status: { in: [TelegramSystemBotWorkflowStatus.COMMITTING] },
          version: 4,
        }),
        data: expect.objectContaining({
          status: TelegramSystemBotWorkflowStatus.COMPLETED,
          completedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('finishes a batch import with one active-to-completed CAS', async () => {
    const { prisma, store } = setup();
    const completed = workflow({
      kind: TelegramSystemBotWorkflowKind.POST_BATCH_IMPORT,
      status: TelegramSystemBotWorkflowStatus.COMPLETED,
      version: 2,
    });
    prisma.telegramSystemBotWorkflow.updateMany.mockResolvedValue({ count: 1 });
    prisma.telegramSystemBotWorkflow.findFirst.mockResolvedValue(completed);

    await store.completeBatchImport({
      ...scope,
      id: 'workflow-1',
      expectedVersion: 1,
    });

    expect(prisma.telegramSystemBotWorkflow.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: [TelegramSystemBotWorkflowStatus.ACTIVE] },
          version: 1,
        }),
        data: expect.objectContaining({
          status: TelegramSystemBotWorkflowStatus.COMPLETED,
        }),
      }),
    );
  });

  it('blocks batch capture while a non-expired Finance input is pending', async () => {
    const { prisma, store } = setup();
    prisma.telegramSystemBotWorkflow.findFirst.mockResolvedValue(null);
    prisma.telegramSystemBotFinanceDraft.findFirst.mockResolvedValue({
      id: 'finance-draft-1',
    });

    await expect(
      store.requireNoActiveOutsideBatchImport(scope),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.telegramSystemBotFinanceDraft.findFirst).toHaveBeenCalledWith(
      {
        where: {
          ...scope,
          status: 'PENDING',
          expiresAt: { gt: expect.any(Date) },
        },
        select: { id: true },
      },
    );
  });

  it('whitelists persisted scope fields from the richer bot runtime context', async () => {
    const { prisma, store } = setup();
    prisma.telegramSystemBotWorkflow.findFirst.mockResolvedValue(null);
    const runtimeScope = {
      ...scope,
      chatId: 'telegram-chat',
      userId: 'user-1',
      telegramUserId: 'telegram-user',
      timezone: 'Europe/Warsaw',
    };

    await store.active(runtimeScope, TelegramSystemBotWorkflowKind.POST_IMPORT);

    expect(prisma.telegramSystemBotWorkflow.findFirst).toHaveBeenCalledWith({
      where: {
        connectionId: scope.connectionId,
        workspaceId: scope.workspaceId,
        status: TelegramSystemBotWorkflowStatus.ACTIVE,
        expiresAt: { gt: expect.any(Date) },
        kind: TelegramSystemBotWorkflowKind.POST_IMPORT,
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
  });

  it('rejects a stale version without overwriting workflow state', async () => {
    const { prisma, store } = setup();
    prisma.telegramSystemBotWorkflow.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      store.transition({
        ...scope,
        id: 'workflow-1',
        expectedVersion: 1,
        step: 'CONTENT',
        payload: { channelId: 'channel-1' },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.telegramSystemBotWorkflow.findFirst).not.toHaveBeenCalled();
  });

  it('cancels an active workflow with a versioned status change', async () => {
    const { prisma, store } = setup();
    prisma.telegramSystemBotWorkflow.updateMany.mockResolvedValue({ count: 1 });
    prisma.telegramSystemBotWorkflow.findFirst.mockResolvedValue(
      workflow({
        status: TelegramSystemBotWorkflowStatus.CANCELLED,
        version: 2,
      }),
    );

    await expect(
      store.cancel({ ...scope, id: 'workflow-1', expectedVersion: 1 }),
    ).resolves.toMatchObject({
      status: TelegramSystemBotWorkflowStatus.CANCELLED,
      version: 2,
    });
    expect(prisma.telegramSystemBotWorkflow.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ...scope,
          version: 1,
          status: {
            in: [
              TelegramSystemBotWorkflowStatus.ACTIVE,
              TelegramSystemBotWorkflowStatus.FAILED,
            ],
          },
        }),
        data: expect.objectContaining({
          status: TelegramSystemBotWorkflowStatus.CANCELLED,
          version: { increment: 1 },
        }),
      }),
    );
  });

  it('allows only one atomic commit claim', async () => {
    const { prisma, store } = setup();
    prisma.telegramSystemBotWorkflow.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    prisma.telegramSystemBotWorkflow.findFirst.mockResolvedValue(
      workflow({
        status: TelegramSystemBotWorkflowStatus.COMMITTING,
        version: 2,
      }),
    );
    const input = { ...scope, id: 'workflow-1', expectedVersion: 1 };

    await expect(store.claimCommit(input)).resolves.toMatchObject({
      status: TelegramSystemBotWorkflowStatus.COMMITTING,
    });
    await expect(store.claimCommit(input)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('journals a created managed post while remaining in committing state', async () => {
    const { prisma, store } = setup();
    prisma.telegramSystemBotWorkflow.updateMany.mockResolvedValue({ count: 1 });
    prisma.telegramSystemBotWorkflow.findFirst.mockResolvedValue(
      workflow({
        status: TelegramSystemBotWorkflowStatus.COMMITTING,
        version: 3,
        resultManagedPostId: 'post-1',
      }),
    );

    await store.recordManagedPost({
      ...scope,
      id: 'workflow-1',
      expectedVersion: 2,
      managedPostId: 'post-1',
    });

    expect(prisma.telegramSystemBotWorkflow.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ...scope,
          status: { in: [TelegramSystemBotWorkflowStatus.COMMITTING] },
          version: 2,
        }),
        data: expect.objectContaining({
          status: TelegramSystemBotWorkflowStatus.COMMITTING,
          resultManagedPostId: 'post-1',
          version: { increment: 1 },
        }),
      }),
    );
  });

  it('never returns or mutates a workflow from another workspace', async () => {
    const { prisma, store } = setup();
    prisma.telegramSystemBotWorkflow.findFirst.mockResolvedValue(null);
    prisma.telegramSystemBotWorkflow.updateMany.mockResolvedValue({ count: 0 });
    const foreignScope = { ...scope, workspaceId: 'workspace-2' };

    await expect(store.get(foreignScope, 'workflow-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      store.claimCommit({
        ...foreignScope,
        id: 'workflow-1',
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.telegramSystemBotWorkflow.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: 'workspace-2' }),
      }),
    );
  });
});
