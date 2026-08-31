import { TelegramCrmSettingsService } from './telegram-crm-settings.service';
import { TelegramCrmSyncStateService } from './telegram-crm-sync-state.service';

describe('TelegramCrmSettingsService', () => {
  it('returns virtual safe defaults without creating or updating a row', async () => {
    const prisma = {
      telegramAdCrmWorkspaceSettings: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const service = new TelegramCrmSettingsService(
      prisma as never,
      {
        require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
      } as never,
      {} as never,
    );

    const result = await service.get('user-1');

    expect(result).toMatchObject({
      workspaceId: 'workspace-1',
      defaultCrmSenderAccountId: null,
      automation: {
        customerTelegramAutomationsEnabled: false,
        typeEnabled: {
          PRE_PUBLICATION_REMINDER: false,
          PUBLISHED_LINKS: false,
          FOLLOW_UP: false,
        },
      },
      createdAt: null,
      updatedAt: null,
    });
    expect(prisma.telegramAdCrmWorkspaceSettings.create).not.toHaveBeenCalled();
    expect(prisma.telegramAdCrmWorkspaceSettings.update).not.toHaveBeenCalled();
  });
});

describe('TelegramCrmSyncStateService', () => {
  it('returns NOT_STARTED for a missing row without materializing sync state', async () => {
    const prisma = {
      telegramCrmAccountSyncState: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
    };
    const service = new TelegramCrmSyncStateService(
      prisma as never,
      {
        require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
      } as never,
      { find: jest.fn().mockResolvedValue({ id: 'account-1' }) } as never,
    );

    const result = await service.get('user-1', 'account-1');

    expect(result.initialImportStatus).toBe('NOT_STARTED');
    expect(result.createdAt).toBeNull();
    expect(prisma.telegramCrmAccountSyncState.create).not.toHaveBeenCalled();
  });
});
