import { TelegramCrmAccountCapabilitiesService } from './telegram-crm-account-capabilities.service';

describe('TelegramCrmAccountCapabilitiesService', () => {
  it('updates each account capability independently and leaves omitted flags untouched', async () => {
    const account = {
      id: 'account-1',
      crmSyncEnabled: false,
      crmSendEnabled: false,
      mtprotoPublishingEnabled: true,
      isPreferredInviteLinkAccount: false,
    };
    const prisma = {
      telegramAdCrmWorkspaceSettings: { findFirst: jest.fn() },
      telegramUserAccountIntegration: {
        update: jest.fn().mockResolvedValue({
          ...account,
          crmSendEnabled: true,
        }),
      },
    };
    const service = new TelegramCrmAccountCapabilitiesService(
      prisma as never,
      {
        require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
      } as never,
      { find: jest.fn().mockResolvedValue(account) } as never,
    );

    const result = await service.update('user-1', 'account-1', {
      crmSendEnabled: true,
    });

    expect(prisma.telegramUserAccountIntegration.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { crmSendEnabled: true } }),
    );
    expect(result).toEqual({
      accountId: 'account-1',
      crmSyncEnabled: false,
      crmSendEnabled: true,
      mtprotoPublishingEnabled: true,
      isPreferredInviteLinkAccount: false,
    });
  });

  it.each([true, false])('accepts only active connected accounts as default (%s)', async (isActive) => {
    const account = {
      id: 'account-new',
      isActive,
      status: 'connected',
      sessionEncrypted: 'fixture',
      sessionIv: 'fixture',
      sessionAuthTag: 'fixture',
      isPreferredInviteLinkAccount: false,
      mtprotoPublishingEnabled: false,
    };
    const accounts = {
      findUnique: jest.fn().mockResolvedValue(account),
      updateMany: jest.fn(),
      update: jest.fn().mockResolvedValue({ ...account, isPreferredInviteLinkAccount: true }),
    };
    const tx = { telegramUserAccountIntegration: accounts, $executeRaw: jest.fn() };
    const runtime = { wake: jest.fn() };
    const service = new TelegramCrmAccountCapabilitiesService(
      { $transaction: (run: (db: typeof tx) => unknown) => run(tx) } as never,
      { require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }) } as never,
      { find: jest.fn().mockResolvedValue(account) } as never,
      runtime as never,
    );
    const result = service.update('user-1', account.id, { isPreferredInviteLinkAccount: true });
    if (!isActive) {
      await expect(result).rejects.toThrow('Connect and activate');
      expect(accounts.updateMany).not.toHaveBeenCalled();
      return;
    }
    await expect(result).resolves.toMatchObject({ isPreferredInviteLinkAccount: true, mtprotoPublishingEnabled: false });
    expect(accounts.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: 'workspace-1', id: { not: account.id }, isPreferredInviteLinkAccount: true },
      data: { isPreferredInviteLinkAccount: false },
    });
    expect(runtime.wake).not.toHaveBeenCalled();
  });
});
