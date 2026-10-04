import { NotFoundException } from '@nestjs/common';
import { GreeterTestModeService } from './greeter-test-mode.service';

describe('GreeterTestModeService', () => {
  const bot = { id: 'bot-1', workspaceId: 'workspace-1' };

  it('resolves only an exact normalized, reachable user of the selected bot', async () => {
    const prisma = {
      telegramBotUser: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'user-1',
          telegramUserId: '77',
          username: 'Exact_User',
          firstName: 'Exact',
          lastName: 'User',
        }),
      },
    };
    const service = new GreeterTestModeService(
      prisma as never,
      {
        requireBot: jest.fn().mockResolvedValue(bot),
      } as never,
    );

    await expect(
      service.resolve('admin', 'bot-1', '  @Exact_User '),
    ).resolves.toMatchObject({ id: 'user-1', username: 'Exact_User' });
    expect(prisma.telegramBotUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-1',
          botIntegrationId: 'bot-1',
          username: { equals: 'Exact_User', mode: 'insensitive' },
          telegramChatId: { not: null },
        }),
      }),
    );
  });

  it('does not fake-resolve a Telegram username unknown to this bot', async () => {
    const service = new GreeterTestModeService(
      {
        telegramBotUser: { findFirst: jest.fn().mockResolvedValue(null) },
      } as never,
      { requireBot: jest.fn().mockResolvedValue(bot) } as never,
    );
    await expect(
      service.resolve('admin', 'bot-1', '@unknown_user'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('enables a bot-scoped session only for a user and channel in the admin bot', async () => {
    const prisma = {
      telegramBotUser: {
        findFirst: jest.fn().mockResolvedValue({ id: 'user-1' }),
      },
      greeterChannel: {
        findFirst: jest.fn().mockResolvedValue({ channelId: 'channel-1' }),
      },
      greeterTestSession: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            id: 'session-1',
            enabled: true,
            generation: 1,
            startedAt: null,
            lastInteractionAt: null,
            enabledAt: new Date('2026-08-09T10:00:00Z'),
            disabledAt: null,
            telegramUser: null,
            channel: null,
          }),
      },
    };
    const admin = { requireBot: jest.fn().mockResolvedValue(bot) };
    const service = new GreeterTestModeService(prisma as never, admin as never);

    await service.enable('admin', 'bot-1', {
      telegramBotUserId: 'user-1',
      channelId: 'channel-1',
    });

    expect(prisma.telegramBotUser.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'user-1',
        workspaceId: 'workspace-1',
        botIntegrationId: 'bot-1',
      }),
    });
    expect(prisma.greeterTestSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          telegramBotUserId: 'user-1',
          channelId: 'channel-1',
        }),
      }),
    );
  });

  it('resets only TEST state and leaves production history untouched', async () => {
    const session = {
      id: 'session-1',
      botIntegrationId: 'bot-1',
      telegramBotUserId: 'user-1',
      generation: 4,
    };
    const prisma: any = {
      greeterTestSession: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(session)
          .mockResolvedValueOnce({
            ...session,
            generation: 5,
            enabled: true,
            startedAt: null,
            lastInteractionAt: null,
            enabledAt: new Date(),
            disabledAt: null,
            telegramUser: null,
            channel: null,
          }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      telegramBotDelivery: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      greeterSequenceStepExecution: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      greeterSequenceEnrollment: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      greeterJoinRequest: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      greeterUserEnvironmentState: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    prisma.$transaction = jest.fn((callback: any) => callback(prisma));
    const service = new GreeterTestModeService(prisma, {
      requireBot: jest.fn().mockResolvedValue(bot),
    } as never);

    await service.reset('admin', 'bot-1');

    expect(prisma.greeterJoinRequest.deleteMany).toHaveBeenCalledWith({
      where: {
        testSessionId: 'session-1',
        environment: 'TEST',
      },
    });
    expect(prisma.greeterUserEnvironmentState.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ environment: 'TEST' }),
    });
    expect(prisma.greeterTestSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ generation: 4 }),
        data: expect.objectContaining({ generation: { increment: 1 } }),
      }),
    );
  });

  it('claims the first /start independently for each test generation', async () => {
    const prisma = {
      greeterUserEnvironmentState: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({
          id: 'state-1',
          startedAt: new Date('2026-08-09T10:00:00Z'),
        }),
      },
      greeterTestSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new GreeterTestModeService(prisma as never, {} as never);
    await expect(
      service.claimStart({
        workspaceId: 'workspace-1',
        botIntegrationId: 'bot-1',
        telegramBotUserId: 'user-1',
        generation: 7,
        at: new Date('2026-08-09T10:00:00Z'),
      }),
    ).resolves.toMatchObject({ firstStart: true });
    expect(prisma.greeterUserEnvironmentState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          botIntegrationId_telegramBotUserId_environment_generation: {
            botIntegrationId: 'bot-1',
            telegramBotUserId: 'user-1',
            environment: 'TEST',
            generation: 7,
          },
        },
      }),
    );
  });
});
