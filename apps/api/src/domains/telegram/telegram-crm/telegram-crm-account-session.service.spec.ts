import { BadRequestException } from '@nestjs/common';
import { TelegramCrmAccountSessionService } from './telegram-crm-account-session.service';

const account = {
  id: 'account-1',
  workspaceId: 'workspace-1',
  apiId: '1',
  apiHashEncrypted: 'hash',
  apiHashIv: 'iv',
  apiHashAuthTag: 'tag',
  sessionEncrypted: 'session',
  sessionIv: 'session-iv',
  sessionAuthTag: 'session-tag',
  status: 'connected',
  isActive: true,
  crmSyncEnabled: true,
  crmSendEnabled: true,
  telegramUserId: '42',
  lastErrorMessage: null,
};

describe('TelegramCrmAccountSessionService', () => {
  it('uses one explicitly bounded startup query for only live-sync eligible accounts', async () => {
    const prisma = {
      telegramUserAccountIntegration: {
        findMany: jest.fn().mockResolvedValue([account]),
      },
    };
    const service = new TelegramCrmAccountSessionService(
      prisma as never,
      {} as never,
    );

    await expect(service.startupAccounts(101)).resolves.toEqual([account]);
    expect(prisma.telegramUserAccountIntegration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          crmSyncEnabled: true,
          isActive: true,
          status: 'connected',
          sessionEncrypted: { not: null },
          sessionIv: { not: null },
          sessionAuthTag: { not: null },
        },
        orderBy: { id: 'asc' },
        take: 101,
      }),
    );
  });

  it.each([
    ['send', { ...account, crmSendEnabled: false }],
    ['sync', { ...account, crmSyncEnabled: false }],
  ] as const)(
    'rejects %s when that account capability is OFF',
    async (purpose, row) => {
      const service = new TelegramCrmAccountSessionService(
        {
          telegramUserAccountIntegration: {
            findFirst: jest.fn().mockResolvedValue(row),
          },
        } as never,
        {} as never,
      );

      const operation =
        purpose === 'send'
          ? service.requireForSend('workspace-1', 'account-1')
          : service.requireForSync('workspace-1', 'account-1');
      await expect(operation).rejects.toBeInstanceOf(BadRequestException);
    },
  );
});
