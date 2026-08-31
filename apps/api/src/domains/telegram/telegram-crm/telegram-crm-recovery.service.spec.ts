import type { TelegramCrmMtprotoUpdate } from '../../../telegram/shared/telegram-crm-mtproto.types';
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
      importDialogs: jest.fn(),
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
      importDialogs: jest.fn().mockResolvedValue(undefined),
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
