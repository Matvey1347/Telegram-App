import { ConflictException } from '@nestjs/common';
import { TelegramUserAccountRemovalService } from './telegram-user-account-removal.service';

describe('TelegramUserAccountRemovalService', () => {
  it.each([
    ['Conversation', { id: 'conversation-1' }, null],
    ['default sender', null, { workspaceId: 'workspace-1' }],
  ])(
    'blocks removal when the account is used by a CRM %s',
    async (_label, conversation, settings) => {
      const prisma = {
        telegramUserAccountIntegration: {
          findFirst: jest.fn().mockResolvedValue({ id: 'account-1' }),
        },
        telegramCrmConversation: {
          findFirst: jest.fn().mockResolvedValue(conversation),
        },
        telegramAdCrmWorkspaceSettings: {
          findFirst: jest.fn().mockResolvedValue(settings),
        },
        $transaction: jest.fn(),
      };
      const service = new TelegramUserAccountRemovalService(
        prisma as never,
        {
          resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
        } as never,
      );

      await expect(
        service.remove('user-1', 'account-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('scopes both dependency checks to the selected workspace', async () => {
    const prisma = {
      telegramUserAccountIntegration: {
        findFirst: jest.fn().mockResolvedValue({ id: 'account-1' }),
      },
      telegramCrmConversation: {
        findFirst: jest.fn().mockResolvedValue({ id: 'c' }),
      },
      telegramAdCrmWorkspaceSettings: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn(),
    };
    const service = new TelegramUserAccountRemovalService(
      prisma as never,
      {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
      } as never,
    );

    await expect(service.remove('user-1', 'account-1')).rejects.toBeDefined();
    expect(prisma.telegramCrmConversation.findFirst).toHaveBeenCalledWith({
      where: { workspaceId: 'workspace-1', mtprotoAccountId: 'account-1' },
      select: { id: true },
    });
  });
});
