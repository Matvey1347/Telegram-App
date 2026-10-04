import { GreeterAutomationTestService } from './greeter-automation-test.service';

describe('GreeterAutomationTestService', () => {
  function setup(overrides: Record<string, unknown> = {}) {
    const prisma = {
      telegramBotUser: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ id: 'tester-1' }),
      },
      greeterChannel: {
        findFirst: jest.fn().mockResolvedValue({ id: 'greeter-channel-1' }),
      },
      greeterTestSession: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      greeterSequenceEnrollment: { findMany: jest.fn().mockResolvedValue([]) },
      telegramBotDelivery: { updateMany: jest.fn() },
      greeterSequenceStepExecution: { updateMany: jest.fn() },
      $transaction: jest.fn((items) => Promise.all(items)),
      ...overrides,
    };
    const sequences = {
      requireBot: jest.fn().mockResolvedValue({
        id: 'bot-1',
        workspaceId: 'workspace-1',
      }),
      require: jest.fn().mockResolvedValue({
        id: 'sequence-1',
        workspaceId: 'workspace-1',
        botIntegrationId: 'bot-1',
      }),
      snapshotPreview: jest.fn().mockResolvedValue({ id: 'draft-version' }),
    };
    const enrollments = { enrollVersion: jest.fn() };
    return {
      prisma,
      sequences,
      enrollments,
      service: new GreeterAutomationTestService(
        prisma as never,
        sequences as never,
        enrollments as never,
      ),
    };
  }

  it('looks up only reachable, interacted users inside the selected bot', async () => {
    const { service, prisma } = setup();

    await service.lookupTesters('admin-1', 'bot-1', '@alex');

    expect(prisma.telegramBotUser.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-1',
          botIntegrationId: 'bot-1',
          blockedAt: null,
          telegramChatId: { not: null },
          OR: expect.any(Array),
          AND: expect.any(Array),
        }),
      }),
    );
  });

  it('keeps the immutable user id when the tester username later changes', async () => {
    const { service, prisma } = setup();
    prisma.greeterTestSession.upsert.mockResolvedValue({
      enabled: true,
      runNumber: 0,
      telegramUser: {
        id: 'tester-1',
        username: 'new_name',
        firstName: 'Alex',
        lastName: null,
      },
      channel: { id: 'channel-1', title: 'Source', username: null },
    });

    const result = await service.selectTester(
      'admin-1',
      'bot-1',
      'sequence-1',
      { telegramBotUserId: 'tester-1', channelId: 'channel-1' },
    );

    expect(prisma.greeterTestSession.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ telegramBotUserId: 'tester-1' }),
        update: expect.objectContaining({ telegramBotUserId: 'tester-1' }),
      }),
    );
    expect(result.tester).toMatchObject({
      id: 'tester-1',
      username: 'new_name',
    });
  });

  it('rejects an unknown or non-interacted tester with actionable guidance', async () => {
    const { service, prisma } = setup();
    prisma.telegramBotUser.findFirst.mockResolvedValue(null);

    await expect(
      service.selectTester('admin-1', 'bot-1', 'sequence-1', {
        telegramBotUserId: 'missing-user',
        channelId: 'channel-1',
      }),
    ).rejects.toThrow(
      'User not found. Ask this user to start/interact with the bot first.',
    );
  });

  it('runs an isolated draft snapshot in TEST without touching production', async () => {
    const { service, prisma, sequences, enrollments } = setup();
    prisma.greeterTestSession.findUnique.mockResolvedValue({
      id: 'session-1',
      enabled: true,
      generation: 2,
      telegramBotUserId: 'tester-1',
      channelId: 'channel-1',
    });
    prisma.greeterTestSession.update.mockResolvedValue({ generation: 3 });
    enrollments.enrollVersion.mockResolvedValue({ id: 'test-enrollment' });

    await service.run('admin-1', 'bot-1', 'sequence-1');

    expect(sequences.snapshotPreview).toHaveBeenCalledWith('sequence-1');
    expect(enrollments.enrollVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        versionId: 'draft-version',
        environment: 'TEST',
        runKey: 'TEST:session-1:3',
      }),
    );
  });

  it('reset cancels pending TEST work without automatically running again', async () => {
    const prisma = {
      greeterTestSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-1',
          enabled: true,
          generation: 2,
          telegramUser: null,
          channel: null,
        }),
        update: jest.fn().mockResolvedValue({
          enabled: true,
          generation: 3,
          startedAt: null,
          lastInteractionAt: null,
          enabledAt: null,
          disabledAt: null,
          telegramUser: null,
          channel: null,
        }),
      },
      greeterSequenceEnrollment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'enrollment-1',
            executions: [
              {
                id: 'execution-1',
                deliveryId: 'delivery-1',
                delivery: { status: 'PENDING' },
              },
            ],
          },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
      telegramBotDelivery: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      greeterSequenceStepExecution: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn((items) => Promise.all(items)),
    };
    const sequences = {
      require: jest.fn().mockResolvedValue({
        id: 'sequence-1',
        botIntegrationId: 'bot-1',
      }),
    };
    const enrollments = { enrollVersion: jest.fn() };
    const service = new GreeterAutomationTestService(
      prisma as never,
      sequences as never,
      enrollments as never,
    );

    const result = await service.reset('admin-1', 'bot-1', 'sequence-1');

    expect(result).toMatchObject({ enabled: true, generation: 3 });
    expect(prisma.telegramBotDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CANCELLED' }),
      }),
    );
    expect(enrollments.enrollVersion).not.toHaveBeenCalled();
  });
});
