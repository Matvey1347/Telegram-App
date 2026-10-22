import { TelegramCrmPurchaseFolderSyncService } from './telegram-crm-purchase-folder-sync.service';
import { ConflictException } from '@nestjs/common';

describe('TelegramCrmPurchaseFolderSyncService', () => {
  it('adds an existing buyer conversation to the configured Telegram customer folder', async () => {
    const setDialogFolderMembership = jest.fn().mockResolvedValue(undefined);
    const runtime = {
      withAccountHandle: jest.fn(
        async (_workspaceId, _accountId, _purpose, operation) =>
          operation({ setDialogFolderMembership }),
      ),
    };
    const prisma = {
      telegramAdCrmWorkspaceSettings: {
        findUnique: jest.fn().mockResolvedValue({ purchaseTagId: 'tag-1' }),
      },
      telegramAdvertiserTag: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ systemKey: 'TELEGRAM_FOLDER:account-1:9' }),
      },
      telegramCrmConversation: {
        findMany: jest.fn().mockResolvedValue([
          {
            telegramAccessHash: 'hash-1',
            peer: { telegramUserId: 'user-1' },
          },
        ]),
      },
    };
    const service = new TelegramCrmPurchaseFolderSyncService(
      prisma as never,
      runtime as never,
    );

    await service.sync('workspace-1', 'advertiser-1');

    expect(setDialogFolderMembership).toHaveBeenCalledWith({
      folderId: 9,
      telegramUserId: 'user-1',
      telegramAccessHash: 'hash-1',
      included: true,
    });
  });

  it('does nothing when the buyer has no conversation for the folder account', async () => {
    const runtime = { withAccountHandle: jest.fn() };
    const prisma = {
      telegramAdCrmWorkspaceSettings: {
        findUnique: jest.fn().mockResolvedValue({ purchaseTagId: 'tag-1' }),
      },
      telegramAdvertiserTag: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ systemKey: 'TELEGRAM_FOLDER:account-1:9' }),
      },
      telegramCrmConversation: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new TelegramCrmPurchaseFolderSyncService(
      prisma as never,
      runtime as never,
    );

    await service.sync('workspace-1', 'advertiser-1');

    expect(runtime.withAccountHandle).not.toHaveBeenCalled();
  });

  it('does not fail a saved sale when another API instance owns the CRM runtime', async () => {
    const runtime = {
      withAccountHandle: jest
        .fn()
        .mockRejectedValue(
          new ConflictException(
            'Telegram CRM runtime is active in another application instance. Retry shortly.',
          ),
        ),
    };
    const prisma = {
      telegramAdCrmWorkspaceSettings: {
        findUnique: jest.fn().mockResolvedValue({ purchaseTagId: 'tag-1' }),
      },
      telegramAdvertiserTag: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ systemKey: 'TELEGRAM_FOLDER:account-1:9' }),
      },
      telegramCrmConversation: {
        findMany: jest.fn().mockResolvedValue([
          {
            telegramAccessHash: 'hash-1',
            peer: { telegramUserId: 'user-1' },
          },
        ]),
      },
    };
    const service = new TelegramCrmPurchaseFolderSyncService(
      prisma as never,
      runtime as never,
    );

    await expect(service.sync('workspace-1', 'advertiser-1')).resolves.toBeUndefined();
    expect(runtime.withAccountHandle).toHaveBeenCalledTimes(1);
  });
});
