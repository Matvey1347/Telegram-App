import { TelegramAiPostingAutopilotSettingsService } from './telegram-ai-posting-autopilot-settings.service';

describe('AI Posting Autopilot activation', () => {
  function setup() {
    const settings = {
      configuration: { topic: 'Editorial idea', audience: 'Readers' },
      configurationVersion: 2,
      autopilotEnabled: false,
      draftExpirationDays: 30,
    };
    const prisma = {
      telegramChannel: {
        findFirst: jest.fn().mockResolvedValue({ id: 'channel' }),
      },
      telegramAiPostingSettings: {
        findFirst: jest.fn().mockResolvedValue(settings),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      telegramChannelPublicationScheduleAssignment: {
        findFirst: jest.fn().mockResolvedValue({
          selectionMode: 'FULL',
          selectedSlots: [],
          schedule: {
            slots: ['08:00', '12:00', '16:00', '20:00'].map((time) => ({
              id: time,
              time,
              isOptional: time === '12:00',
            })),
          },
        }),
      },
      telegramAiPostingAutopilotRun: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      telegramManagedPost: {
        count: jest.fn().mockResolvedValueOnce(117).mockResolvedValue(112),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      aiWorkspaceConfig: {
        findUnique: jest.fn().mockResolvedValue({
          enabled: true,
          automaticEnabled: true,
          aiPostingUnlimited: true,
        }),
      },
      aiCategoryConfig: {
        findMany: jest.fn().mockResolvedValue([{}, {}, {}, {}]),
      },
    };
    const auth = {
      require: jest.fn().mockResolvedValue({ workspaceId: 'workspace' }),
    };
    return {
      prisma,
      auth,
      service: new TelegramAiPostingAutopilotSettingsService(
        prisma as never,
        auth as never,
      ),
    };
  }

  it('activates only the selected workspace channel and derives a 150-draft cap from its plan', async () => {
    const { service, prisma, auth } = setup();
    await expect(
      service.update('user', 'channel', {
        enabled: true,
      }),
    ).resolves.toMatchObject({
      weeklySlotsMin: 21,
      weeklySlotsMax: 28,
      drafts: 117,
      draftsToGenerate: 38,
      targetReadyDrafts: 150,
      readyDrafts: 112,
    });
    expect(prisma.telegramAiPostingSettings.updateMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace',
        telegramChannelId: 'channel',
        autopilotEnabled: false,
        configurationVersion: 2,
      },
      data: expect.objectContaining({
        mode: 'AUTOPILOT',
        autopilotEnabled: true,
        draftExpirationDays: 60,
      }),
    });
    expect(auth.require.mock.calls).toEqual([
      ['user', 'posts.manage'],
      ['user', 'operations.executeAi'],
    ]);
  });

  it('enables scheduling when automatic AI generation is unavailable', async () => {
    const { service, prisma } = setup();
    prisma.aiCategoryConfig.findMany.mockResolvedValue([{}]);
    await expect(
      service.update('user', 'channel', {
        enabled: true,
      }),
    ).resolves.toMatchObject({ automaticGenerationAvailable: false });
    expect(prisma.telegramAiPostingSettings.updateMany).toHaveBeenCalledTimes(
      1,
    );
  });

  it('allows pausing and leaves generated drafts and reserved slots alone', async () => {
    const { service, prisma, auth } = setup();
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue({
      autopilotEnabled: true,
    });
    await service.update('user', 'channel', { enabled: false });
    expect(prisma.telegramAiPostingSettings.updateMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace',
        telegramChannelId: 'channel',
        autopilotEnabled: true,
      },
      data: { autopilotEnabled: false, autopilotNextRunAt: null },
    });
    expect(auth.require.mock.calls).toEqual([['user', 'posts.manage']]);
  });

  it('returns bounded channel history and the current stage of a leased run', async () => {
    const { service, prisma } = setup();
    const startedAt = new Date(Date.now() - 1000);
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue({
      autopilotEnabled: true,
      autopilotLeaseExpiresAt: new Date(Date.now() + 60_000),
    });
    prisma.telegramAiPostingAutopilotRun.findMany.mockResolvedValue([
      {
        id: 'active',
        status: 'RUNNING',
        currentStage: 'GENERATE_DRAFTS',
        startedAt,
        stages: [{ id: 'stage', stage: 'GENERATE_DRAFTS', startedAt, metadata: { requested: 4 } }],
      },
      {
        id: 'past', status: 'PARTIAL', startedAt, completedAt: startedAt,
        failureType: 'AI_API_UNAVAILABLE', stages: [],
        summary: { generated: 2, scheduled: 1, costs: { text: '0.05' }, errors: ['AI_API_UNAVAILABLE', 'private provider error'] },
      },
    ]);

    await expect(service.read('user', 'channel')).resolves.toMatchObject({
      activeRunId: 'active',
      activeStage: 'GENERATE_DRAFTS',
      history: [
        { id: 'active', stages: [{ startedAt: startedAt.toISOString(), targetCount: 4 }] },
        { id: 'past', errorCodes: ['AI_API_UNAVAILABLE'], summary: { generated: 2, scheduled: 1, costs: { text: '0.05' } } },
      ],
    });
    expect(prisma.telegramAiPostingAutopilotRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'workspace', telegramChannelId: 'channel' },
        take: 10,
      }),
    );

    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue({
      autopilotEnabled: true, autopilotLeaseExpiresAt: startedAt,
    });
    await expect(service.read('user', 'channel')).resolves.toMatchObject({
      activeRunId: null, activeStage: null,
      history: expect.arrayContaining([expect.objectContaining({ id: 'active' })]),
    });
  });

  it('does not read history for a channel outside the workspace', async () => {
    const { service, prisma } = setup();
    prisma.telegramChannel.findFirst.mockResolvedValue(null);
    await expect(service.read('user', 'other-channel')).rejects.toThrow('Telegram channel not found');
    expect(prisma.telegramAiPostingAutopilotRun.findMany).not.toHaveBeenCalled();
  });
});
