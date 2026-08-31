import { BadRequestException } from '@nestjs/common';
import { TelegramCrmAccountAccessService } from './telegram-crm-account-access.service';

const usable = {
  id: 'account-1',
  workspaceId: 'workspace-1',
  label: 'CRM sender',
  status: 'connected',
  isActive: true,
  sessionEncrypted: 'session',
  sessionIv: 'iv',
  sessionAuthTag: 'tag',
  crmSyncEnabled: false,
  crmSendEnabled: true,
  mtprotoPublishingEnabled: true,
};

describe('TelegramCrmAccountAccessService', () => {
  it('uses a compact workspace-scoped account lookup', async () => {
    const findFirst = jest.fn().mockResolvedValue(usable);
    const service = new TelegramCrmAccountAccessService({
      telegramUserAccountIntegration: { findFirst },
    } as never);

    await service.requireUsableSender('workspace-1', 'account-1');

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'account-1', workspaceId: 'workspace-1' },
        select: expect.not.objectContaining({ assignedMemberId: true }),
      }),
    );
  });

  it.each([
    ['cross-workspace/missing', null],
    ['disconnected', { ...usable, status: 'error' }],
    ['inactive', { ...usable, isActive: false }],
    ['missing session', { ...usable, sessionEncrypted: null }],
    ['send-disabled', { ...usable, crmSendEnabled: false }],
  ])('rejects a %s default sender', async (_label, row) => {
    const service = new TelegramCrmAccountAccessService({
      telegramUserAccountIntegration: {
        findFirst: jest.fn().mockResolvedValue(row),
      },
    } as never);

    await expect(
      service.requireUsableSender('workspace-1', 'account-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
