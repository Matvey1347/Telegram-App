import { TelegramUserAccountStatus } from '@prisma/client';
import { TelegramUserAccountsService } from './telegram-user-accounts.service';

describe('TelegramUserAccountsService runtime lifecycle', () => {
  it('wakes the CRM runtime after an eligibility-changing account update', async () => {
    const account = {
      id: 'account-1',
      workspaceId: 'workspace-1',
      status: TelegramUserAccountStatus.connected,
      isActive: true,
    };
    const prisma = {
      telegramUserAccountIntegration: {
        findFirst: jest.fn().mockResolvedValue(account),
        update: jest.fn().mockResolvedValue({ ...account, isActive: false }),
      },
    };
    const runtimeNotifier = { wake: jest.fn() };
    const service = new TelegramUserAccountsService(
      prisma as never,
      {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { writeStructured: jest.fn() } as never,
      {} as never,
      {} as never,
      runtimeNotifier as never,
    );

    await service.update('user-1', 'account-1', { isActive: false });

    expect(runtimeNotifier.wake).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      accountId: 'account-1',
      reason: 'credentials',
    });
  });
});
