import type { TelegramCrmMtprotoUpdate } from '@api/telegram/shared/mtproto/telegram-crm-mtproto.types';
import { TelegramCrmRecoveryService } from './telegram-crm-recovery.service';

const callArgument = (
  mock: { mock: { calls: unknown[][] } },
  index = 0,
): unknown => mock.mock.calls[index]?.[0];

const checkpoint = { pts: 10, qts: 0, date: 20, seq: 30 };
const account = { id: 'account-1', workspaceId: 'workspace-1' } as never;

describe('TelegramCrmRecoveryService', () => {
  it('drains the complete captured baseline queue before checkpointing it', async () => {
    const updates = Array.from(
      { length: 256 },
      (_, index): TelegramCrmMtprotoUpdate => ({
        type: 'peer.metadata',
        telegramUserId: String(index + 1),
        username: `user_${index + 1}`,
      }),
    );
    const prisma = {
      telegramCrmAccountSyncState: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
      telegramCrmConversation: { findMany: jest.fn() },
    };
    const batchStore = {
      applyUpdates: jest.fn().mockResolvedValue({ needsRecovery: false }),
      importDialogs: jest.fn().mockResolvedValue({ importedConversations: 0 }),
    };
    const handle = {
      getState: jest.fn().mockResolvedValue(checkpoint),
      getDifference: jest.fn().mockResolvedValue({
        updates: [],
        peers: [],
        checkpoint,
        final: true,
        tooLong: false,
      }),
    };
    const service = new TelegramCrmRecoveryService(
      prisma as never,
      batchStore as never,
    );

    await expect(
      service.recover({
        account,
        handle: handle as never,
        captureQueue: () => updates,
      }),
    ).resolves.toEqual({ outcome: 'SUCCESS', checkpoint });

    expect(batchStore.applyUpdates).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ updates: updates.slice(0, 100) }),
    );
    const firstBatch = callArgument(batchStore.applyUpdates);
    const secondBatch = callArgument(batchStore.applyUpdates, 1);
    const finalBaselineBatch = callArgument(batchStore.applyUpdates, 2);
    expect(firstBatch).toHaveProperty('checkpoint', undefined);
    expect(secondBatch).toHaveProperty('checkpoint', undefined);
    expect(finalBaselineBatch).toMatchObject({
      updates: updates.slice(200),
      checkpoint,
    });
  });

  it('does not advance a checkpoint when Telegram reports DifferenceTooLong', async () => {
    const prisma = {
      telegramCrmAccountSyncState: {
        findUnique: jest.fn().mockResolvedValue({
          incrementalCheckpoint: JSON.stringify(checkpoint),
        }),
        upsert: jest.fn().mockResolvedValue(undefined),
      },
    };
    const batchStore = {
      applyUpdates: jest.fn(),
      importDialogs: jest.fn().mockResolvedValue({ importedConversations: 0 }),
    };
    const handle = {
      getDifference: jest.fn().mockResolvedValue({
        updates: [],
        peers: [],
        checkpoint: { ...checkpoint, pts: 999 },
        final: false,
        tooLong: true,
      }),
      listPrivateDialogs: jest.fn().mockResolvedValue({ dialogs: [] }),
    };
    const service = new TelegramCrmRecoveryService(
      prisma as never,
      batchStore as never,
    );

    await expect(
      service.recover({
        account,
        handle: handle as never,
        captureQueue: () => [],
      }),
    ).resolves.toEqual({ outcome: 'STOPPED' });

    expect(batchStore.applyUpdates).not.toHaveBeenCalled();
    expect(handle.listPrivateDialogs).not.toHaveBeenCalled();
    expect(batchStore.importDialogs).not.toHaveBeenCalled();
    const failureWrite = callArgument(
      prisma.telegramCrmAccountSyncState.upsert,
    );
    expect(failureWrite).toMatchObject({
      update: {
        status: 'FAILED',
        initialImportStatus: 'NOT_STARTED',
        initialImportCursor: null,
        incrementalCheckpoint: null,
        recoveryCheckpoint: 'DIFFERENCE_TOO_LONG',
        lastErrorCode: 'DIFFERENCE_TOO_LONG_REIMPORT_REQUIRED',
      },
    });
  });

  it('rechecks runtime generation after waiting for the recovery semaphore', async () => {
    const prisma = {
      telegramCrmAccountSyncState: { findUnique: jest.fn() },
    };
    const service = new TelegramCrmRecoveryService(
      prisma as never,
      {} as never,
    );

    await expect(
      service.recover({
        account,
        handle: {} as never,
        captureQueue: () => [],
        isCurrent: () => false,
      }),
    ).resolves.toEqual({ outcome: 'STOPPED' });
    expect(
      prisma.telegramCrmAccountSyncState.findUnique,
    ).not.toHaveBeenCalled();
  });
});

describe('CRM difference peer recovery', () => {
  function setup(failResolution = false) {
    const known = new Set(['1000']);
    const updates: TelegramCrmMtprotoUpdate[] = Array.from(
      { length: 12 },
      (_, index) => ({
        type: 'message.new',
        message: {
          telegramMessageId: index + 1,
          telegramUserId: String(1000 + index),
          direction: 'INBOUND',
          text: 'A private incoming message',
          sentAt: new Date(),
          editedAt: null,
          contentMetadata: null,
        },
      }),
    );
    updates.push(updates[0]);
    const peer = (id: string) => ({
      telegramUserId: id,
      telegramAccessHash: `access-${id}`,
      username: null,
      firstName: 'Client',
      lastName: null,
      photoUrl: null,
    });
    const next = { ...checkpoint, pts: checkpoint.pts + updates.length };
    const state = { incrementalCheckpoint: JSON.stringify(checkpoint) };
    const prisma = {
      telegramCrmAccountSyncState: {
        findUnique: jest.fn().mockResolvedValue(state),
        upsert: jest.fn(),
      },
      telegramCrmConversation: {
        findMany: jest.fn(() =>
          Promise.resolve(
            [...known].map((id) => ({ peer: { telegramUserId: id } })),
          ),
        ),
      },
    };
    const batchStore = {
      importDialogs: jest.fn(
        (input: { dialogs: Array<{ peer: { telegramUserId: string } }> }) => {
          input.dialogs.forEach((dialog) =>
            known.add(dialog.peer.telegramUserId),
          );
          return Promise.resolve({
            importedConversations: input.dialogs.length,
          });
        },
      ),
      applyUpdates: jest.fn((input: { updates: TelegramCrmMtprotoUpdate[] }) =>
        Promise.resolve({
          needsRecovery: input.updates.some(
            (update) =>
              update.type === 'message.new' &&
              !known.has(update.message.telegramUserId),
          ),
        }),
      ),
    };
    let active = 0,
      maximumActive = 0;
    const handle = {
      getDifference: jest.fn().mockResolvedValue({
        updates,
        peers: [peer('1001')],
        checkpoint: next,
        final: true,
        tooLong: false,
      }),
      resolvePrivatePeer: jest.fn(
        async ({ telegramUserId }: { telegramUserId: string }) => {
          active += 1;
          maximumActive = Math.max(active, maximumActive);
          try {
            await new Promise<void>((resolve) => setImmediate(resolve));
            if (failResolution) throw new Error('USER_ID_INVALID');
            return peer(telegramUserId);
          } finally {
            active -= 1;
          }
        },
      ),
    };
    const service = new TelegramCrmRecoveryService(
      prisma as never,
      batchStore as never,
    );
    return {
      service,
      prisma,
      batchStore,
      handle,
      next,
      state,
      maximum: () => maximumActive,
    };
  }

  it('resolves missing difference peers before applying updates, sharing supplied entities and bounding RPC concurrency', async () => {
    const h = setup();
    await expect(
      h.service.recover({
        account,
        handle: h.handle as never,
        captureQueue: () => [],
      }),
    ).resolves.toEqual({ outcome: 'SUCCESS', checkpoint: h.next });
    expect(h.handle.resolvePrivatePeer).toHaveBeenCalledTimes(10);
    expect(h.maximum()).toBe(5);
    expect(h.batchStore.applyUpdates).toHaveBeenCalledTimes(1);
    expect(h.batchStore.applyUpdates).toHaveBeenCalledWith(
      expect.objectContaining({
        checkpoint: h.next,
        updates: expect.any(Array) as unknown,
      }),
    );
    expect(h.prisma.telegramCrmConversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-1',
          mtprotoAccountId: 'account-1',
        }) as unknown,
      }),
    );
    expect(h.handle.resolvePrivatePeer).not.toHaveBeenCalledWith({
      telegramUserId: '1000',
    });
    expect(h.handle.resolvePrivatePeer).not.toHaveBeenCalledWith({
      telegramUserId: '1001',
    });
  });

  it('keeps the prior checkpoint and skips apply when missing peer resolution fails', async () => {
    const h = setup(true);
    await expect(
      h.service.recover({
        account,
        handle: h.handle as never,
        captureQueue: () => [],
      }),
    ).rejects.toThrow('USER_ID_INVALID');
    expect(h.handle.resolvePrivatePeer).toHaveBeenCalledTimes(5);
    expect(h.maximum()).toBeLessThanOrEqual(5);
    expect(h.batchStore.applyUpdates).not.toHaveBeenCalled();
    expect(h.prisma.telegramCrmAccountSyncState.upsert).not.toHaveBeenCalled();
    expect(h.state.incrementalCheckpoint).toBe(JSON.stringify(checkpoint));
  });
});

it('marks new-peer folder work before import/checkpoint and does not rewrite unchanged later slices', async () => {
  const order: string[] = [];
  const folderRefresh = {
    markDirty: jest.fn(async () => {
      order.push('dirty');
      return { targeted: true, version: 1 };
    }),
  };
  const prisma = {
    telegramCrmAccountSyncState: {
      findUnique: jest
        .fn()
        .mockResolvedValue({
          incrementalCheckpoint: JSON.stringify(checkpoint),
        }),
    },
    telegramCrmConversation: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const store = {
    importDialogs: jest.fn(async () => {
      order.push('import');
      return { importedConversations: 1 };
    }),
    applyUpdates: jest.fn(async () => {
      order.push('checkpoint');
      return { needsRecovery: false };
    }),
  };
  const peer = {
    telegramUserId: '42',
    telegramAccessHash: '420',
    username: null,
    firstName: null,
    lastName: null,
    photoUrl: null,
  };
  const difference = {
    updates: [],
    peers: [],
    checkpoint,
    final: false,
    tooLong: false,
  };
  const handle = {
    getDifference: jest
      .fn()
      .mockResolvedValueOnce({ ...difference, peers: [peer] })
      .mockResolvedValueOnce(difference)
      .mockResolvedValueOnce({ ...difference, final: true }),
  };
  const callback = jest.fn();
  await new TelegramCrmRecoveryService(
    prisma as never,
    store as never,
    folderRefresh as never,
  ).recover({
    account,
    handle: handle as never,
    captureQueue: () => [],
    onNewConversations: callback,
  });
  expect(folderRefresh.markDirty).toHaveBeenCalledTimes(1);
  expect(order).toEqual([
    'dirty',
    'import',
    'checkpoint',
    'checkpoint',
    'checkpoint',
  ]);
  expect(callback).toHaveBeenCalledWith(['42'], 1);
});

it('does not advance a folder-change checkpoint when the durable marker write fails', async () => {
  const store = { applyUpdates: jest.fn() };
  const prisma = {
    telegramCrmAccountSyncState: {
      findUnique: jest
        .fn()
        .mockResolvedValue({
          incrementalCheckpoint: JSON.stringify(checkpoint),
        }),
    },
  };
  const handle = {
    getDifference: jest
      .fn()
      .mockResolvedValue({
        updates: [{ type: 'folders.changed' }],
        peers: [],
        checkpoint,
        final: true,
        tooLong: false,
      }),
  };
  const folderRefresh = {
    markDirty: jest.fn().mockRejectedValue(new Error('database offline')),
    abandonTargeted: jest.fn(),
  };
  await expect(
    new TelegramCrmRecoveryService(
      prisma as never,
      store as never,
      folderRefresh as never,
    ).recover({ account, handle: handle as never, captureQueue: () => [] }),
  ).rejects.toThrow('database offline');
  expect(store.applyUpdates).not.toHaveBeenCalled();
});
