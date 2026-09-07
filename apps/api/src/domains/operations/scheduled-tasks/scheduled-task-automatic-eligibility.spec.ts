import { ScheduledTaskAutomaticEligibility } from './scheduled-task-automatic-eligibility';

describe('ScheduledTaskAutomaticEligibility', () => {
  it('arms daily CRM sync only when a selected connected account exists', async () => {
    const prisma = {
      telegramChannel: { count: jest.fn().mockResolvedValue(0) },
      telegramUserAccountIntegration: { count: jest.fn().mockResolvedValue(1) },
      scheduledTaskConfig: {
        findMany: jest.fn().mockImplementation(({ where }) =>
          Promise.resolve(
            where.taskKey.in.includes('telegram.crm.sync')
              ? [
                  {
                    id: 'crm-config',
                    schedule: {
                      frequency: 'DAILY',
                      time: '06:00',
                      timezone: 'Europe/Warsaw',
                    },
                  },
                ]
              : [],
          ),
        ),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    await new ScheduledTaskAutomaticEligibility(
      prisma as never,
    ).refreshWorkspace('workspace-1');

    expect(prisma.telegramUserAccountIntegration.count).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-1',
        isActive: true,
        status: 'connected',
        crmSyncEnabled: true,
      },
    });
    expect(prisma.scheduledTaskConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'crm-config' },
        data: expect.objectContaining({ enabled: true, autoDisarmed: false }),
      }),
    );
  });

  it('auto-disarms CRM sync after the last selected account is removed', async () => {
    const prisma = {
      telegramChannel: { count: jest.fn().mockResolvedValue(0) },
      telegramUserAccountIntegration: { count: jest.fn().mockResolvedValue(0) },
      scheduledTaskConfig: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    await new ScheduledTaskAutomaticEligibility(
      prisma as never,
    ).refreshWorkspace('workspace-1');

    expect(prisma.scheduledTaskConfig.updateMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-1',
        taskKey: { in: ['telegram.crm.sync'] },
        enabled: true,
      },
      data: expect.objectContaining({
        enabled: false,
        autoDisarmed: true,
        nextScheduledRunAt: null,
      }),
    });
  });
});
