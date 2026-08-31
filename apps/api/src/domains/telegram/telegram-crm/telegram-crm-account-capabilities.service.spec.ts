import { TelegramCrmAccountCapabilitiesService } from './telegram-crm-account-capabilities.service';

describe('TelegramCrmAccountCapabilitiesService', () => {
  it('updates each account capability independently and leaves omitted flags untouched', async () => {
    const account = {
      id: 'account-1',
      crmSyncEnabled: false,
      crmSendEnabled: false,
      mtprotoPublishingEnabled: true,
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
    });
  });
});
