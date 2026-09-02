import { TelegramCrmBatchStoreService } from './telegram-crm-batch-store.service';

describe('TelegramCrmBatchStoreService', () => {
  it('does not dispatch after-commit events when the persistence transaction rolls back', async () => {
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(new Error('rollback')),
    };
    const messages = {
      emitAfterCommit: jest.fn(),
      emitReadsAfterCommit: jest.fn(),
      emitPeerMetadataAfterCommit: jest.fn(),
    };
    const service = new TelegramCrmBatchStoreService(
      prisma as never,
      {} as never,
      messages as never,
    );

    await expect(
      service.applyUpdates({
        workspaceId: 'workspace-1',
        accountId: 'account-1',
        updates: [],
      }),
    ).rejects.toThrow('rollback');
    expect(messages.emitAfterCommit).not.toHaveBeenCalled();
    expect(messages.emitReadsAfterCommit).not.toHaveBeenCalled();
    expect(messages.emitPeerMetadataAfterCommit).not.toHaveBeenCalled();
  });
});
