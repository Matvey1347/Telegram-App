import { ConflictException } from '@nestjs/common';
import { TelegramBotIdentityService } from './telegram-bot-identity.service';

describe('TelegramBotIdentityService', () => {
  const prisma = {
    telegramBotRuntimeInstance: {
      findFirst: jest.fn(),
    },
  };
  const service = new TelegramBotIdentityService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('rejects a bot already connected to the workspace', async () => {
    prisma.telegramBotRuntimeInstance.findFirst.mockResolvedValue({ id: 'bot-1' });

    await expect(
      service.ensureAvailable('workspace-1', '123'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows a distinct BotFather identity', async () => {
    prisma.telegramBotRuntimeInstance.findFirst.mockResolvedValue(null);
    await expect(
      service.ensureAvailable('workspace-1', '456'),
    ).resolves.toBeUndefined();
  });
});
