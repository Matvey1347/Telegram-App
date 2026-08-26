/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- focused Prisma test double */
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
  } as any;
  return {
    prisma,
    store: new TelegramSystemBotWorkflowStore(prisma),
  };
}

describe('TelegramSystemBotWorkflowStore', () => {
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
