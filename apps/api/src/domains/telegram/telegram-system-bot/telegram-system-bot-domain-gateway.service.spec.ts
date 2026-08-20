import { NotFoundException } from '@nestjs/common';
import { TelegramSystemBotDomainGatewayService } from './telegram-system-bot-domain-gateway.service';

describe('TelegramSystemBotDomainGatewayService', () => {
  const prisma = {
    telegramChannel: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  } as any;
  const moduleRef = {
    registerRequestByContextId: jest.fn(),
    resolve: jest.fn(),
  } as any;
  let service: TelegramSystemBotDomainGatewayService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TelegramSystemBotDomainGatewayService(prisma, moduleRef);
  });

  it('lists only channels accessible to the connected Telegram account', async () => {
    prisma.telegramChannel.findMany.mockResolvedValue([]);

    await service.channels('workspace-1', 'telegram-user-1');

    expect(prisma.telegramChannel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace-1',
          adminLinks: {
            some: {
              telegramUserAccountIntegration: {
                telegramUserId: 'telegram-user-1',
                isActive: true,
              },
            },
          },
        },
      }),
    );
  });

  it('does not sync a channel unavailable to the connected Telegram account', async () => {
    prisma.telegramChannel.findFirst.mockResolvedValue(null);

    await expect(
      service.syncChannel(
        'user-1',
        'workspace-1',
        'telegram-user-1',
        'foreign-channel',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(moduleRef.resolve).not.toHaveBeenCalled();
  });
});
