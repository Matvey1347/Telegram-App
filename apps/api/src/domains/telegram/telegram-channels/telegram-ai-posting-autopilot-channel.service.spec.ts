import { Prisma } from '@prisma/client';
import { TelegramAiPostingAutopilotChannelService } from './telegram-ai-posting-autopilot-channel.service';

describe('AI Posting Autopilot channel execution', () => {
  const scope = { workspaceId: 'workspace', telegramChannelId: 'channel' };
  const future = (days: number, minute = 0) =>
    new Date(Date.now() + days * 86_400_000 + minute * 60_000).toISOString();
  const slot = (
    days: number,
    kind = 'CONTENT',
    state = 'AVAILABLE',
    minute = 0,
  ) => ({
    kind,
    state,
    slotId: `plan-${kind}`,
    scheduledAt: future(days, minute),
  });

  const make = () => {
    const prisma = {
      telegramAiPostingSettings: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'settings',
          mode: 'AUTOPILOT',
          aiMonthlyBudget: new Prisma.Decimal(20),
          draftExpirationDays: 60,
        }),
      },
      workspaceMember: {
        findFirst: jest.fn().mockResolvedValue({ userId: 'owner' }),
      },
      telegramChannel: {
        findFirst: jest.fn().mockResolvedValue({ title: 'Editorial' }),
      },
      telegramChannelPublicationScheduleAssignment: {
        findFirst: jest.fn().mockResolvedValue({
          selectionMode: 'SUBSET',
          selectedSlots: [{ slotId: 'evening' }],
          schedule: {
            slots: [
              { id: 'evening', time: '18:00' },
              { id: 'morning', time: '08:00' },
            ],
          },
        }),
      },
      aiWorkspaceConfig: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            enabled: true,
            automaticEnabled: true,
            aiPostingUnlimited: true,
          }),
      },
      aiCategoryConfig: {
        findMany: jest.fn().mockResolvedValue([{}, {}, {}, {}]),
      },
      telegramManagedPost: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      telegramAiPostingAutopilotRun: { update: jest.fn() },
      telegramAiPostingAutopilotStage: { create: jest.fn() },
      $queryRaw: jest
        .fn()
        .mockResolvedValue([
          { stage: 'search', bucket: 'successful', cost: new Prisma.Decimal('0.008'), unknown: 0 },
          { stage: 'search', bucket: 'failed', cost: new Prisma.Decimal('0.004'), unknown: 1 },
        ]),
    };
    const generator = {
      generate: jest.fn().mockResolvedValue({ generated: [], failures: [], runId: 'empty', version: 1 }).mockResolvedValueOnce({
        generated: [
          { imageUrl: 'stored-image', mediaReadiness: 'READY' },
          { imageUrl: null, mediaReadiness: 'MISSING' },
        ],
        failures: [{ code: 'AI_POSTING_IMAGE_PROVIDER_FAILED' }],
        runId: 'test-run',
        version: 1,
      }),
    };
    const testRuns = {
      reviewPublication: jest
        .fn()
        .mockResolvedValueOnce({ version: 2 })
        .mockResolvedValueOnce({
          version: 3,
          publications: [{ savedPostId: 'new' }],
        }),
    };
    const calendar = {
      occurrencesByChannels: jest.fn().mockResolvedValue({
        channel: [
          slot(1, 'AD'),
          slot(1, 'CONTENT', 'OCCUPIED', 1),
          slot(2),
          slot(12),
        ],
      }),
    };
    const publication = {
      scheduleManagedPost: jest
        .fn()
        .mockResolvedValue({ scheduleMode: 'LOCAL' }),
    };
    const auth = { require: jest.fn() };
    const service = new TelegramAiPostingAutopilotChannelService(
      prisma as never,
      generator as never,
      testRuns as never,
      calendar as never,
      publication as never,
      auth as never,
    );
    return {
      service,
      prisma,
      generator,
      testRuns,
      publication,
      calendar,
      auth,
    };
  };

  it('reuses verified drafts before generating and schedules only empty content slots from the assigned plan', async () => {
    const { service, prisma, generator, testRuns, publication } = make();
    prisma.telegramManagedPost.findMany
      .mockResolvedValueOnce([{ id: 'existing' }])
      .mockResolvedValueOnce([{ id: 'new' }]);
    const run = await service.run(
      scope.workspaceId,
      scope.telegramChannelId,
      'run',
      'worker',
    );

    expect(
      publication.scheduleManagedPost.mock.calls.map(([, , id, dto]) => [
        id,
        dto.publicationSlotId,
      ]),
    ).toEqual([
      ['existing', 'plan-CONTENT'],
      ['new', 'plan-CONTENT'],
    ]);
    expect(
      publication.scheduleManagedPost.mock.invocationCallOrder[0],
    ).toBeLessThan(generator.generate.mock.invocationCallOrder[0]);
    expect(generator.generate).toHaveBeenCalledWith(
      'owner',
      'channel',
      10,
      'AUTOMATIC',
      'run',
    );
    expect(
      testRuns.reviewPublication.mock.calls.map(([, , , index, , action]) => [
        index,
        action,
      ]),
    ).toEqual([
      [0, 'approve'],
      [0, 'save'],
    ]);
    expect(prisma.telegramManagedPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ...scope,
          AND: expect.arrayContaining([
            {
              OR: [
                { aiPostingReviewStatus: null },
                { aiPostingReviewStatus: 'APPROVED' },
              ],
            },
          ]),
          imageUrls: { isEmpty: false },
        }),
      }),
    );
    expect(run).toMatchObject({
      status: 'PARTIAL',
      generated: 1,
      scheduled: 2,
      costs: { search: '0.012' },
      costBreakdown: { successful: '0.008', failed: '0.004', shared: '0', unknownByBucket: { successful: 0, failed: 1, shared: 0 } },
      unknownCosts: 1,
    });
  });

  it('fills a deficit larger than one model batch under the same report run', async () => {
    const { service, prisma, calendar, generator, testRuns } = make();
    calendar.occurrencesByChannels.mockResolvedValue({ channel: [] });
    prisma.telegramManagedPost.count.mockResolvedValueOnce(34).mockResolvedValueOnce(50);
    generator.generate.mockReset().mockImplementation((_user, _channel, count: number) =>
      Promise.resolve({ generated: Array.from({ length: count }, () => ({ imageUrl: 'stored', mediaReadiness: 'READY' })),
        failures: [], runId: 'test', version: 1 }));
    testRuns.reviewPublication.mockReset().mockImplementation((_user, _channel, _run, index: number, version: number) =>
      Promise.resolve({ version: version + 1, publications: Array.from({ length: index + 1 }, () => ({ savedPostId: 'saved' })) }));
    const result = await service.run('workspace', 'channel', 'run', 'worker');
    expect(generator.generate.mock.calls.map((args) => args.slice(2))).toEqual([
      [10, 'AUTOMATIC', 'run'], [6, 'AUTOMATIC', 'run'],
    ]);
    expect(result).toMatchObject({ generated: 16, readyDrafts: 50, errors: [] });
  });

  it('replaces recoverable failures within the same run to reach the draft target', async () => {
    const { service, prisma, calendar, generator, testRuns } = make();
    calendar.occurrencesByChannels.mockResolvedValue({ channel: [] });
    prisma.telegramManagedPost.count.mockResolvedValueOnce(46).mockResolvedValueOnce(50);
    const ready = { imageUrl: 'stored', mediaReadiness: 'READY' };
    generator.generate.mockReset()
      .mockResolvedValueOnce({
        generated: [ready, ready], failures: [{ code: 'AI_POSTING_IMAGE_PROVIDER_FAILED' }],
        runId: 'first-batch', version: 1,
      })
      .mockResolvedValueOnce({
        generated: [ready, ready], failures: [], runId: 'replacement-batch', version: 1,
      });
    testRuns.reviewPublication.mockReset().mockImplementation((_user, _channel, run, index: number, version: number) =>
      Promise.resolve({
        version: version + 1,
        publications: Array.from({ length: index + 1 }, (_, i) => ({ savedPostId: `${run}-${i}` })),
      }));

    const result = await service.run('workspace', 'channel', 'run', 'worker');
    expect(generator.generate.mock.calls.map((args) => args.slice(2))).toEqual([
      [4, 'AUTOMATIC', 'run'], [2, 'AUTOMATIC', 'run'],
    ]);
    expect(result).toMatchObject({ generated: 4, readyDrafts: 50, status: 'PARTIAL' });
  });

  it('schedules complete editor drafts while automatic AI is disabled', async () => {
    const { service, prisma, publication, generator } = make();
    prisma.aiWorkspaceConfig.findUnique.mockResolvedValue({
      enabled: true,
      automaticEnabled: false,
    });
    prisma.telegramManagedPost.count.mockResolvedValue(1);
    prisma.telegramManagedPost.findMany.mockResolvedValue([
      { id: 'editor-draft' },
    ]);
    const result = await service.run('workspace', 'channel', 'run', 'worker');
    expect(result).toMatchObject({ scheduled: 1, generated: 0 });
    expect(publication.scheduleManagedPost).toHaveBeenCalledWith(
      'owner',
      'channel',
      'editor-draft',
      expect.anything(),
    );
    expect(generator.generate).not.toHaveBeenCalled();
  });

  it('reserves slots across the calendar for fresh drafts even when older stock can fill every slot', async () => {
    const { service, prisma, generator, publication, calendar, testRuns } = make();
    const slots = [slot(1), slot(2), slot(3), slot(4)];
    calendar.occurrencesByChannels.mockResolvedValue({ channel: slots });
    prisma.telegramManagedPost.count.mockResolvedValue(50);
    prisma.telegramManagedPost.findMany.mockResolvedValueOnce([
      { id: 'old-1' }, { id: 'old-2' },
    ]);
    const ready = { imageUrl: 'stored-image', mediaReadiness: 'READY' };
    generator.generate.mockReset().mockResolvedValue({
      generated: [ready, ready], failures: [], runId: 'test-run', version: 1,
    });
    testRuns.reviewPublication.mockReset()
      .mockResolvedValueOnce({ version: 2 })
      .mockResolvedValueOnce({ version: 3, publications: [{ savedPostId: 'new-1' }] })
      .mockResolvedValueOnce({ version: 4 })
      .mockResolvedValueOnce({ version: 5, publications: [{}, { savedPostId: 'new-2' }] });

    await expect(service.run('workspace', 'channel', 'run', 'worker'))
      .resolves.toMatchObject({ scheduled: 4, generated: 2 });
    expect(publication.scheduleManagedPost.mock.calls.map((call) => {
      const [, , postId, payload] = call as unknown as [string, string, string, { scheduledAt: string }];
      return [postId, payload.scheduledAt];
    })).toEqual([
      ['old-1', slots[0].scheduledAt],
      ['old-2', slots[2].scheduledAt],
      ['new-1', slots[1].scheduledAt],
      ['new-2', slots[3].scheduledAt],
    ]);
  });

  it('fills all due vacancies from existing drafts when no generation is needed', async () => {
    const { service, prisma, generator, publication, calendar } = make();
    const slots = [slot(1), slot(2), slot(3), slot(4)];
    calendar.occurrencesByChannels.mockResolvedValue({ channel: slots });
    prisma.telegramManagedPost.count.mockResolvedValueOnce(54).mockResolvedValueOnce(50);
    prisma.telegramManagedPost.findMany.mockResolvedValueOnce(
      slots.map((_, index) => ({ id: `ready-${index + 1}` })),
    );

    await expect(service.run('workspace', 'channel', 'run', 'worker'))
      .resolves.toMatchObject({ scheduled: 4, generated: 0, readyDrafts: 50 });
    expect(generator.generate).not.toHaveBeenCalled();
    expect(publication.scheduleManagedPost).toHaveBeenCalledTimes(4);
  });

  it('does no generation or scheduling when inventory is full and only later slots are vacant', async () => {
    const { service, prisma, generator, publication, calendar } = make();
    prisma.telegramManagedPost.count.mockResolvedValue(50);
    calendar.occurrencesByChannels.mockResolvedValue({
      channel: [slot(1, 'CONTENT', 'OCCUPIED'), slot(11)],
    });
    const run = await service.run('workspace', 'channel', 'run', 'worker');
    expect(run).toMatchObject({
      status: 'COMPLETED',
      generated: 0,
      scheduled: 0,
      readyDrafts: 50,
      nextCheckHours: 24,
    });
    expect(generator.generate).not.toHaveBeenCalled();
    expect(publication.scheduleManagedPost).not.toHaveBeenCalled();
  });

  it('finishes a previously started refill after the first ten days are covered', async () => {
    const { service, prisma, calendar, publication } = make();
    const through = future(18);
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue({
      id: 'settings',
      mode: 'AUTOPILOT',
      aiMonthlyBudget: new Prisma.Decimal(20),
      draftExpirationDays: 60,
      autopilotLastSummary: { refillThrough: through },
    });
    prisma.telegramManagedPost.count.mockResolvedValue(60);
    prisma.telegramManagedPost.findMany.mockResolvedValue([{ id: 'existing' }]);
    calendar.occurrencesByChannels.mockResolvedValue({
      channel: [slot(1, 'CONTENT', 'OCCUPIED'), slot(13)],
    });
    const result = await service.run('workspace', 'channel', 'run', 'worker');
    expect(calendar.occurrencesByChannels).toHaveBeenCalledWith(
      'owner',
      expect.objectContaining({ to: through }),
    );
    expect(publication.scheduleManagedPost).toHaveBeenCalledTimes(1);
    expect(result.refillThrough).toBeNull();
  });

  it('stops before spending if its lease was replaced or the channel was disabled', async () => {
    const { service, prisma, generator, calendar } = make();
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue(null);
    await expect(
      service.run('workspace', 'channel', 'run', 'old'),
    ).resolves.toMatchObject({ status: 'STOPPED' });
    expect(prisma.telegramAiPostingSettings.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ...scope,
          autopilotEnabled: true,
          autopilotLeaseOwner: 'old',
          autopilotLeaseExpiresAt: { gt: expect.any(Date) },
        }),
      }),
    );
    expect(generator.generate).not.toHaveBeenCalled();
    expect(calendar.occurrencesByChannels).not.toHaveBeenCalled();
  });

  it('does not spend if the assigned publication plan has no content slots', async () => {
    const { service, prisma, generator, publication } = make();
    prisma.telegramChannelPublicationScheduleAssignment.findFirst.mockResolvedValue(
      null,
    );
    await expect(
      service.run('workspace', 'channel', 'run', 'worker'),
    ).resolves.toMatchObject({
      status: 'FAILED',
      errors: ['PUBLICATION_PLAN_REQUIRED'],
    });
    expect(generator.generate).not.toHaveBeenCalled();
    expect(publication.scheduleManagedPost).not.toHaveBeenCalled();
  });
});
