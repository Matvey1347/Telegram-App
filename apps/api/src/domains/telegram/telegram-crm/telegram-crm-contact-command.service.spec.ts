import { ForbiddenException } from '@nestjs/common';
import { TelegramCrmContactCommandService } from './telegram-crm-contact-command.service';

describe('TelegramCrmContactCommandService', () => {
  it('authorizes writes against Contact ownership inside the selected workspace', async () => {
    const prisma = {
      telegramAdvertiser: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'contact-1',
          workspaceId: 'workspace-1',
          ownerMemberId: 'member-2',
          archivedAt: null,
          automatedMessagesEnabled: false,
          automatedMessagesEnabledAt: null,
        }),
        update: jest.fn(),
      },
    };
    const authorization = {
      require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
      context: jest.fn().mockResolvedValue({
        workspaceId: 'workspace-1',
        memberId: 'member-1',
      }),
      can: jest.fn(async (_userId: string, key: string) =>
        ['adSales.crm.editOwn'].includes(key),
      ),
      requireOwnOrAny: jest.fn().mockRejectedValue(new ForbiddenException()),
    };
    const service = new TelegramCrmContactCommandService(
      prisma as never,
      authorization as never,
    );

    await expect(
      service.update('user-1', 'contact-1', { stage: 'QUALIFIED' }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.telegramAdvertiser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'contact-1', workspaceId: 'workspace-1' },
      }),
    );
    expect(authorization.requireOwnOrAny).toHaveBeenCalledWith(
      'user-1',
      { assignedMemberId: 'member-2' },
      'adSales.crm.editOwn',
      'adSales.crm.editAny',
    );
    expect(prisma.telegramAdvertiser.update).not.toHaveBeenCalled();
  });
});
