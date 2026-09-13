import { BadRequestException } from '@nestjs/common';
import { TelegramUserAccountStatus } from '@prisma/client';
import { TelegramChannelImportPreparationService } from './telegram-channel-import-preparation.service';

describe('TelegramChannelImportPreparationService account selection', () => {
  const findMany = jest.fn();
  const service = new TelegramChannelImportPreparationService(
    {
      telegramUserAccountIntegration: { findMany },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => findMany.mockReset());

  it('prefers the connected account assigned to the importing user', async () => {
    findMany.mockResolvedValue([
      {
        id: 'older-workspace-account',
        assignedMember: null,
      },
      {
        id: 'assigned-account',
        assignedMember: { userId: 'user-1' },
      },
    ]);

    const accounts = await service.connectedAccounts('workspace-1', 'user-1');

    expect(accounts.map((account) => account.id)).toEqual([
      'assigned-account',
      'older-workspace-account',
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace-1',
          isActive: true,
          status: TelegramUserAccountStatus.connected,
        },
      }),
    );
  });

  it('rejects the import when the workspace has no connected account', async () => {
    findMany.mockResolvedValue([]);

    await expect(
      service.connectedAccounts('workspace-1', 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
