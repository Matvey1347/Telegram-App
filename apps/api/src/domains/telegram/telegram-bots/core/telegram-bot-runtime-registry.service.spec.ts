/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import {
  TelegramBotRuntimeEnvironment,
  TelegramBotRuntimeStatus,
} from '@prisma/client';
import { TelegramBotRuntimeRegistryService } from './telegram-bot-runtime-registry.service';

describe('TelegramBotRuntimeRegistryService', () => {
  const row = {
    id: 'local-1',
    environment: TelegramBotRuntimeEnvironment.LOCAL,
    runtimeStatus: TelegramBotRuntimeStatus.ACTIVE,
    botTokenEncrypted: 'encrypted',
    botTokenIv: 'iv',
    botTokenAuthTag: 'tag',
    botIntegration: { applicationType: 'FINANCE', isActive: true },
  } as any;
  const prisma = {
    telegramBotRuntimeInstance: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  } as any;
  const encryption = {
    decrypt: jest.fn().mockReturnValue('local-token'),
  } as any;

  beforeEach(() => jest.clearAllMocks());

  it('serves active runtime credentials from memory after one bounded bootstrap', async () => {
    prisma.telegramBotRuntimeInstance.findMany.mockResolvedValue([row]);
    const registry = new TelegramBotRuntimeRegistryService(prisma, encryption);
    await registry.bootstrap(TelegramBotRuntimeEnvironment.LOCAL);

    const resolved = await registry.resolve(
      'local-1',
      TelegramBotRuntimeEnvironment.LOCAL,
    );

    expect(resolved?.token).toBe('local-token');
    expect(prisma.telegramBotRuntimeInstance.findFirst).not.toHaveBeenCalled();
  });

  it('invalidates and reloads a mutated runtime with an environment-scoped fallback', async () => {
    prisma.telegramBotRuntimeInstance.findMany.mockResolvedValue([row]);
    prisma.telegramBotRuntimeInstance.findFirst.mockResolvedValue(row);
    const registry = new TelegramBotRuntimeRegistryService(prisma, encryption);
    await registry.bootstrap(TelegramBotRuntimeEnvironment.LOCAL);

    await registry.refresh('local-1', TelegramBotRuntimeEnvironment.LOCAL);

    expect(prisma.telegramBotRuntimeInstance.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'local-1',
        environment: TelegramBotRuntimeEnvironment.LOCAL,
      },
      include: { botIntegration: true },
    });
  });
});
