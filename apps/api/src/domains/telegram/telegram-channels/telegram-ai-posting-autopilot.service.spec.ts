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
      telegramAiPostingTestRun: {
        findFirst: jest.fn().mockResolvedValue({ publications: [{ title: 'x' }] }),
        updateMany: jest.fn(),
      },
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
    const result = await (service as any).processChannel(
      'ws',
      'channel',
      'run',
      'worker',
    );
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
    const result = await (service as any).processChannel(
      'ws',
      'channel',
      'run',
      'worker',
    );
    expect(generator.generate).toHaveBeenCalledWith(
      'member',
      'channel',
      5,
      'AUTOMATIC',
      'run',
    );
    const reviewPublicationMock = testRuns.reviewPublication as jest.Mock;
    expect(reviewPublicationMock).toHaveBeenCalledTimes(10);
    const reviewCalls = reviewPublicationMock.mock.calls as unknown as Array<
      [string, string, string, number, number, string]
    >;
    expect(reviewCalls.slice(0, 4)).toEqual([
      ['member', 'channel', 'run', 0, 2, 'approve'],
      ['member', 'channel', 'run', 0, 3, 'save'],
      ['member', 'channel', 'run', 1, 5, 'approve'],
      ['member', 'channel', 'run', 1, 6, 'save'],
    ]);
    expect(planner.apply).toHaveBeenCalledTimes(1);
    expect(result.generated).toBe(5);
  });

  it('keeps REVIEW generation in the test-run queue without approving or saving it', async () => {
    const { service, prisma, generator, testRuns, planner } = make();
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue(
      config({
        mode: 'REVIEW',
        postsPerDay: 1,
        targetReadyDrafts: 1,
        targetCoverageDays: 1,
        criticalCoverageDays: 1,
      }),
    );
    prisma.telegramManagedPost.count.mockResolvedValue(0);
    generator.generate.mockResolvedValue({
      runId: 'review-run',
      version: 1,
      generated: [{}],
    });
    planner.preview.mockResolvedValue({ assignments: [] });

    await (service as any).processChannel('ws', 'channel', 'run', 'worker');

    expect(generator.generate).toHaveBeenCalledTimes(1);
    expect(testRuns.reviewPublication).not.toHaveBeenCalled();
    expect(prisma.telegramAiPostingTestRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          publications: expect.anything(),
        },
      }),
    );
    expect(planner.apply).not.toHaveBeenCalled();
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
    const result = await (service as any).processChannel(
      'ws',
      'channel',
      'run',
      'worker',
    );
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

  it('executes the claimed channel through processDueBatch and releases its active lease', async () => {
    const { service, prisma, generator } = make();
    const scheduledFor = new Date();
    const row = {
      id: 'settings-1',
      workspaceId: 'ws',
      telegramChannelId: 'channel',
      configurationVersion: 3,
      autopilotNextRunAt: scheduledFor,
      autopilotRetryOfRunId: null,
    };
    let claimedOwner: string | undefined;
    let leaseActive = false;
    prisma.telegramAiPostingSettings.findMany.mockResolvedValue([row]);
    prisma.telegramAiPostingSettings.updateMany.mockImplementation(
      async ({ where, data }: any) => {
        if (data.autopilotLeaseOwner) {
          claimedOwner = data.autopilotLeaseOwner;
          leaseActive = true;
          return { count: 1 };
        }
        if (
          where.autopilotLeaseOwner === claimedOwner &&
          where.autopilotLeaseExpiresAt?.gt instanceof Date &&
          leaseActive
        ) {
          leaseActive = false;
          return { count: 1 };
        }
        return { count: 0 };
      },
    );
    prisma.telegramAiPostingSettings.findFirst.mockImplementation(
      async ({ where }: any) => {
        if (
          where.workspaceId === row.workspaceId &&
          where.telegramChannelId === row.telegramChannelId &&
          where.autopilotEnabled === true &&
          where.autopilotLeaseOwner === claimedOwner &&
          where.autopilotLeaseExpiresAt?.gt instanceof Date &&
          leaseActive
        )
          return config({
            postsPerDay: 1,
            targetReadyDrafts: 0,
            targetCoverageDays: 1,
            criticalCoverageDays: 1,
          });
        return null;
      },
    );
    prisma.telegramManagedPost.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    const result = await service.processDueBatch();

    expect(result).toMatchObject({ processed: 1, failed: 0, generated: 0 });
    expect(prisma.telegramAiPostingSettings.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'ws',
          telegramChannelId: 'channel',
          autopilotEnabled: true,
          autopilotLeaseOwner: expect.any(String),
          autopilotLeaseExpiresAt: { gt: expect.any(Date) },
        }),
      }),
    );
    expect(prisma.telegramAiPostingSettings.updateMany).toHaveBeenCalledTimes(
      2,
    );
    expect(prisma.telegramAiPostingAutopilotRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run' },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
    expect(generator.generate).not.toHaveBeenCalled();
  });

  it('does not process settings when another worker owns the active lease', async () => {
    const { service, prisma, generator, planner } = make();
    prisma.telegramAiPostingSettings.findFirst.mockImplementation(
      async ({ where }: any) =>
        where.autopilotLeaseOwner === 'worker-a' ? config() : null,
    );

    const result = await (service as any).processChannel(
      'ws',
      'channel',
      'run',
      'worker-b',
    );

    expect(result.status).toBe('STOPPED');
    expect(prisma.telegramAiPostingSettings.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'ws',
          telegramChannelId: 'channel',
          autopilotEnabled: true,
          autopilotLeaseOwner: 'worker-b',
          autopilotLeaseExpiresAt: { gt: expect.any(Date) },
        }),
      }),
    );
    expect(generator.generate).not.toHaveBeenCalled();
    expect(planner.preview).not.toHaveBeenCalled();
  });

  it.each(['expired', 'replaced'])(
    'does not process a %s lease',
    async (leaseState) => {
      const { service, prisma, generator, planner } = make();
      const expiredAt = new Date(Date.now() - 1);
      prisma.telegramAiPostingSettings.findFirst.mockImplementation(
        async ({ where }: any) => {
          const requestedOwner = where.autopilotLeaseOwner;
          const currentOwner =
            leaseState === 'replaced' ? 'worker-b' : 'worker-a';
          const currentExpiry =
            leaseState === 'expired'
              ? expiredAt
              : new Date(Date.now() + 60_000);
          return requestedOwner === currentOwner &&
            currentExpiry > where.autopilotLeaseExpiresAt.gt
            ? config()
            : null;
        },
      );

      const result = await (service as any).processChannel(
        'ws',
        'channel',
        'run',
        'worker-a',
      );

      expect(result.status).toBe('STOPPED');
      expect(generator.generate).not.toHaveBeenCalled();
      expect(planner.preview).not.toHaveBeenCalled();
    },
  );

  it('does not process settings after Autopilot has been disabled', async () => {
    const { service, prisma, generator, planner } = make();
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue(null);

    const result = await (service as any).processChannel(
      'ws',
      'channel',
      'run',
      'worker',
    );

    expect(result.status).toBe('STOPPED');
    expect(prisma.telegramAiPostingSettings.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          autopilotEnabled: true,
          autopilotLeaseOwner: 'worker',
        }),
      }),
    );
    expect(generator.generate).not.toHaveBeenCalled();
    expect(planner.preview).not.toHaveBeenCalled();
  });

  it('does not start processing when the atomic lease claim fails', async () => {
    const { service, prisma } = make();
    const processChannel = jest.spyOn(service as any, 'processChannel');
    prisma.telegramAiPostingSettings.findMany.mockResolvedValue([
      {
        id: 'settings-1',
        workspaceId: 'ws',
        telegramChannelId: 'channel',
        autopilotNextRunAt: new Date(),
      },
    ]);
    prisma.telegramAiPostingSettings.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.processDueBatch();

    expect(result.processed).toBe(0);
    expect(result.failed).toBe(0);
    expect(processChannel).not.toHaveBeenCalled();
    expect(prisma.telegramAiPostingAutopilotRun.create).not.toHaveBeenCalled();
  });

  it('marks execution failed rather than completed if its lease expires before release', async () => {
    const { service, prisma } = make();
    const row = {
      id: 'settings-1',
      workspaceId: 'ws',
      telegramChannelId: 'channel',
      configurationVersion: 3,
      autopilotNextRunAt: new Date(),
      autopilotRetryOfRunId: null,
    };
    let claimedOwner: string | undefined;
    let claimCount = 0;
    prisma.telegramAiPostingSettings.findMany.mockResolvedValue([row]);
    prisma.telegramAiPostingSettings.updateMany.mockImplementation(
      async ({ data }: any) => {
        claimCount++;
        if (data.autopilotLeaseOwner) {
          claimedOwner = data.autopilotLeaseOwner;
          return { count: 1 };
        }
        // The lease is no longer valid at finalization; the failure handler may
        // clear it only if this worker still owns it.
        return { count: claimCount === 3 && claimedOwner ? 1 : 0 };
      },
    );
    prisma.telegramAiPostingSettings.findFirst.mockImplementation(
      async ({ where }: any) => {
        if (where.autopilotLeaseOwner === claimedOwner)
          return config({
            postsPerDay: 1,
            targetReadyDrafts: 0,
            targetCoverageDays: 1,
            criticalCoverageDays: 1,
          });
        return { autopilotEnabled: true };
      },
    );
    prisma.telegramManagedPost.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    const result = await service.processDueBatch();

    expect(result).toMatchObject({ processed: 1, failed: 1 });
    expect(prisma.telegramAiPostingAutopilotRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run' },
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
    expect(
      prisma.telegramAiPostingAutopilotRun.update,
    ).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run' },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
  });
});
