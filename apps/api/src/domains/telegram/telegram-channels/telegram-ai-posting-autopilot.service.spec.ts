import { TelegramAiPostingAutopilotService } from './telegram-ai-posting-autopilot.service';

describe('TelegramAiPostingAutopilotService', () => {
  const make = () => {
    const prisma: any = {
      telegramAiPostingSettings: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      telegramAiPostingAutopilotRun: {
        create: jest.fn().mockResolvedValue({ id: 'run' }),
        update: jest.fn(),
        findFirst: jest.fn(),
        deleteMany: jest.fn(),
      },
      telegramAiPostingAutopilotStage: { create: jest.fn() },
      workspaceMember: {
        findFirst: jest.fn().mockResolvedValue({ userId: 'member' }),
      },
      telegramManagedPost: { count: jest.fn() },
    };
    const generator: any = { generate: jest.fn() };
    const testRuns: any = {
      reviewPublication: jest.fn().mockResolvedValue({
        publications: Array.from({ length: 5 }, (_, index) => ({
          savedPostId: `draft-${index}`,
        })),
      }),
    };
    const planner: any = { preview: jest.fn(), apply: jest.fn() };
    const moduleRef: any = {
      resolve: jest.fn().mockResolvedValue({ notify: jest.fn() }),
    };
    const workspace: any = {
      resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('ws'),
    };
    const notifications: any = {
      emitRunSummary: jest.fn(),
      emitRunFailure: jest.fn(),
    };
    return {
      service: new TelegramAiPostingAutopilotService(
        prisma,
        generator,
        testRuns,
        planner,
        moduleRef,
        workspace,
        notifications,
      ),
      prisma,
      generator,
      testRuns,
      planner,
    };
  };
  const config = (overrides: Record<string, unknown> = {}) => ({
    postsPerDay: 4,
    targetReadyDrafts: 50,
    maxReadyDrafts: 100,
    targetCoverageDays: 14,
    criticalCoverageDays: 7,
    configuration: {},
    ...overrides,
  });

  it('uses existing drafts at scale and never generates extra posts when 200 are ready', async () => {
    const { service, prisma, generator, planner } = make();
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue(config());
    prisma.telegramManagedPost.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(50)
      .mockResolvedValueOnce(56)
      .mockResolvedValueOnce(200)
      .mockResolvedValueOnce(56)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(56);
    planner.preview.mockResolvedValue({ assignments: [{ postId: 'draft' }] });
    planner.apply
      .mockResolvedValueOnce({ schedule: { successCount: 50, failedCount: 0 } })
      .mockResolvedValueOnce({ schedule: { successCount: 6, failedCount: 0 } });
    const result = await (service as any).processChannel('ws', 'channel');
    expect(planner.apply).toHaveBeenCalledTimes(2);
    expect(result.scheduled).toBe(56);
    expect(generator.generate).not.toHaveBeenCalled();
  });

  it('generates a bounded batch when no drafts exist and then schedules through the planner', async () => {
    const { service, prisma, generator, testRuns, planner } = make();
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue(
      config({
        postsPerDay: 4,
        targetReadyDrafts: 5,
        targetCoverageDays: 1,
        criticalCoverageDays: 1,
      }),
    );
    prisma.telegramManagedPost.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(4);
    generator.generate.mockResolvedValue({
      runId: 'run',
      version: 2,
      generated: [{}, {}, {}, {}, {}],
    });
    planner.preview
      .mockResolvedValueOnce({ assignments: [] })
      .mockResolvedValueOnce({ assignments: [{ postId: 'p' }] });
    planner.apply.mockResolvedValue({
      schedule: { successCount: 4, failedCount: 0 },
    });
    const result = await (service as any).processChannel('ws', 'channel');
    expect(generator.generate).toHaveBeenCalledWith(
      'member',
      'channel',
      5,
      'AUTOMATIC',
      undefined,
    );
    expect(testRuns.reviewPublication).toHaveBeenCalledTimes(5);
    expect(planner.apply).toHaveBeenCalledTimes(1);
    expect(result.generated).toBe(5);
  });

  it('records slot conflicts as partial results without retrying the same booking', async () => {
    const { service, prisma, planner } = make();
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue(
      config({ targetReadyDrafts: 0 }),
    );
    prisma.telegramManagedPost.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    planner.preview.mockResolvedValue({ assignments: [{ postId: 'draft' }] });
    planner.apply.mockResolvedValue({
      schedule: { successCount: 0, failedCount: 1 },
    });
    const result = await (service as any).processChannel('ws', 'channel');
    expect(planner.apply).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('PARTIAL');
    expect(result.errors).toContain('1 slot assignments conflicted');
  });

  it('uses an atomic lease claim so a repeated worker run cannot process the same due settings twice', async () => {
    const { service, prisma } = make();
    prisma.telegramAiPostingSettings.findMany
      .mockResolvedValueOnce([
        {
          id: 's',
          workspaceId: 'ws',
          telegramChannelId: 'ch',
          autopilotNextRunAt: new Date(),
        },
      ])
      .mockResolvedValueOnce([]);
    prisma.telegramAiPostingSettings.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    jest.spyOn(service as any, 'processChannel').mockResolvedValue({
      scheduled: 0,
      generated: 0,
      status: 'COMPLETED',
      errors: [],
    });
    const first = await service.processDueBatch();
    const second = await service.processDueBatch();
    expect(first.processed).toBe(1);
    expect(second.processed).toBe(0);
  });
});
