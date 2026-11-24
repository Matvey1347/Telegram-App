import { ConflictException, NotFoundException } from '@nestjs/common';
import { TelegramAiPostingTestRunService } from './telegram-ai-posting-test-run.service';

type UpdateData = Record<string, unknown> & {
  version?: { increment: number };
};
type UpdateArgs = { where: { version: number }; data: UpdateData };
type StoredRun = {
  id: string;
  workspaceId: string;
  telegramChannelId: string;
  version: number;
  settingsVersion: number;
  status: string;
  publications: unknown;
  operations: unknown[];
  failures: unknown[];
  feedback: unknown[];
};
type MockTransaction = {
  $queryRaw: jest.Mock;
  telegramAiPostingTestRun: {
    updateMany: (args: UpdateArgs) => Promise<{ count: number }>;
    deleteMany: jest.Mock;
  };
  telegramAiPostingSettings: { updateMany: jest.Mock };
  telegramAiPostingSettingsVersion: { create: jest.Mock };
  telegramManagedPost: { create: jest.Mock };
  aiOperation: { updateMany: jest.Mock };
  telegramAiPostingGeneration: { create: jest.Mock };
  telegramManagedPostContentHypothesis: { create: jest.Mock };
};

describe('TelegramAiPostingTestRunService review lifecycle', () => {
  const diagnostic = {
    sourceId: 'source-1',
    sourceType: 'rss',
    displayValue: 'feed.example',
    status: 'COLLECTED',
  };
  const publication = (overrides: Record<string, unknown> = {}) => ({
    topic: 'Editorial topic',
    title: 'Approved title',
    text: 'Approved text',
    imagePrompt: 'Editorial image',
    imageUrl: 'https://media.example/approved.jpg',
    imageSourceId: 'media-source',
    mediaReadiness: 'READY',
    format: 'standard',
    category: 'general',
    reviewNotes: [],
    costs: { planning: '0.01', text: '0.02', image: '0.03', review: '0.04' },
    operations: [
      {
        stage: 'image',
        attempt: 1,
        operationId: 'image-op',
        category: 'TELEGRAM_POSTING_IMAGE',
        model: 'image-model',
        status: 'SUCCEEDED',
        actualCost: '0.03',
        pricingStatus: 'PRICED',
        inputTokens: null,
        outputTokens: null,
      },
    ],
    ideaSources: [{ id: 'source-1', type: 'rss', value: 'feed.example' }],
    status: 'PENDING',
    rejectionReason: null,
    savedPostId: null,
    ...overrides,
  });

  const setup = (publicationOverrides: Record<string, unknown> = {}) => {
    let storedRun: StoredRun = {
      id: 'run-1',
      workspaceId: 'workspace-1',
      telegramChannelId: 'channel-1',
      version: 1,
      settingsVersion: 4,
      status: 'COMPLETED',
      publications: {
        items: [publication(publicationOverrides)],
        sourceDiagnostics: [diagnostic],
      },
      operations: [],
      failures: [],
      feedback: [],
    };
    const applyRunUpdate = (data: UpdateData) => {
      const { version, ...rest } = data;
      Object.assign(storedRun, rest);
      if (version?.increment) storedRun.version += version.increment;
    };
    const tx: MockTransaction = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      telegramAiPostingSettings: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      telegramAiPostingSettingsVersion: {
        create: jest.fn().mockResolvedValue({}),
      },
      telegramAiPostingTestRun: {
        updateMany: jest.fn(({ where, data }: UpdateArgs) => {
          if (where.version !== storedRun.version)
            return Promise.resolve({ count: 0 });
          applyRunUpdate(data);
          return Promise.resolve({ count: 1 });
        }),
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      telegramManagedPost: { create: jest.fn() },
      aiOperation: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      telegramAiPostingGeneration: { create: jest.fn() },
      telegramManagedPostContentHypothesis: { create: jest.fn() },
    };
    const prisma = {
      telegramAiPostingTestRun: {
        findFirst: jest.fn(
          ({
            where,
          }: {
            where: Pick<StoredRun, 'id' | 'workspaceId' | 'telegramChannelId'>;
          }) =>
            Promise.resolve(
              where.id === storedRun.id &&
                where.workspaceId === storedRun.workspaceId &&
                where.telegramChannelId === storedRun.telegramChannelId
                ? (JSON.parse(JSON.stringify(storedRun)) as StoredRun)
                : null,
            ),
        ),
        updateMany: jest.fn(({ where, data }: UpdateArgs) => {
          if (where.version !== storedRun.version)
            return Promise.resolve({ count: 0 });
          applyRunUpdate(data);
          return Promise.resolve({ count: 1 });
        }),
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      telegramAiPostingSettings: {
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(
        (callback: (transaction: MockTransaction) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const posts = {
      prepareManagedPostCreate: jest.fn(
        (
          _userId: string,
          _channelId: string,
          dto: { title: string; text: string; imageUrls: string[] },
        ) => ({
          workspaceId: 'workspace-1',
          channelId: 'channel-1',
          assignedMemberId: 'member-1',
          title: dto.title,
          text: dto.text,
          imageUrls: dto.imageUrls,
        }),
      ),
      createManagedPostRecord: jest
        .fn()
        .mockResolvedValue({ id: 'managed-post-1' }),
    };
    const gateway = { execute: jest.fn() };
    const workspace = {
      resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
    };
    const revisions = { createManagedPostRevision: jest.fn() };
    const images = { resolve: jest.fn() };
    const service = new TelegramAiPostingTestRunService(
      prisma as never,
      workspace as never,
      gateway as never,
      posts as never,
      revisions as never,
      images as never,
    );
    return {
      service,
      prisma,
      workspace,
      posts,
      gateway,
      revisions,
      images,
      tx,
      get storedRun() {
        return storedRun;
      },
      set storedRun(value: StoredRun) {
        storedRun = value;
      },
    };
  };

  const act = (
    service: TelegramAiPostingTestRunService,
    action: 'approve' | 'reject' | 'edit' | 'save' | 'regenerate-image',
    version = 1,
    value?: string,
  ) =>
    service.reviewPublication(
      'user-1',
      'channel-1',
      'run-1',
      0,
      version,
      action,
      value,
    );

  it('transitions PENDING to APPROVED to SAVED_DRAFT with exact approved media and text', async () => {
    const ctx = setup();
    await act(ctx.service, 'approve');
    await act(ctx.service, 'save', 2);

    expect(ctx.posts.prepareManagedPostCreate).toHaveBeenCalledWith(
      'user-1',
      'channel-1',
      {
        title: 'Approved title',
        text: 'Approved text',
        imageUrls: ['https://media.example/approved.jpg'],
      },
    );
    expect(ctx.posts.createManagedPostRecord).toHaveBeenCalledWith(
      ctx.tx,
      expect.objectContaining({
        title: 'Approved title',
        text: 'Approved text',
        imageUrls: ['https://media.example/approved.jpg'],
        mediaItems: [
          { kind: 'PHOTO', url: 'https://media.example/approved.jpg' },
        ],
      }),
    );
    const saved = ctx.storedRun.publications as {
      items: Array<Record<string, unknown>>;
      sourceDiagnostics: unknown[];
    };
    expect(saved.items[0]).toMatchObject({
      status: 'SAVED_DRAFT',
      savedPostId: 'managed-post-1',
      text: 'Approved text',
      imageUrl: 'https://media.example/approved.jpg',
      mediaReadiness: 'READY',
      costs: { image: '0.03' },
    });
    expect(saved.sourceDiagnostics).toEqual([diagnostic]);
  });

  it.each([['approve', 'PENDING'], ['save', 'APPROVED']] as const)(
    'blocks %s when the publication has no image',
    async (action, status) => {
      const ctx = setup({ status, imageUrl: null, mediaReadiness: 'MISSING' });
      await expect(act(ctx.service, action)).rejects.toThrow('AI_POSTING_IMAGE_REQUIRED');
      expect(ctx.posts.prepareManagedPostCreate).not.toHaveBeenCalled();
      expect(ctx.storedRun.version).toBe(1);
    },
  );

  it('saves the valid sphere, rubric and length with the approved publication', async () => {
    const ctx = setup({
      editorialMetadata: {
        sphere: { id: 'sphere' },
        rubric: { id: 'rubric' },
        length: { id: 'short' },
      },
      format: 'Legacy group',
      category: 'Legacy hypothesis',
    });
    const tags = {
      aiPostingSphereId: 'sphere',
      aiPostingRubricId: 'rubric',
      aiPostingLengthId: 'channel-1::short',
    };
    ctx.tx.$queryRaw.mockResolvedValue([tags]);

    await act(ctx.service, 'approve');
    await act(ctx.service, 'save', 2);

    expect(ctx.tx.$queryRaw).toHaveBeenCalledWith(
      expect.anything(),
      'rubric',
      'channel-1::short',
      'sphere',
      'workspace-1',
      'channel-1',
    );
    const [, record] = ctx.posts.createManagedPostRecord.mock
      .calls[0] as unknown as [unknown, Record<string, unknown>];
    expect(record).toMatchObject(tags);
    expect(record.groupId).toBeUndefined();
    expect(
      ctx.tx.telegramManagedPostContentHypothesis.create,
    ).not.toHaveBeenCalled();
  });

  it('preserves an approved draft when its old rubric is no longer valid', async () => {
    const ctx = setup({
      editorialMetadata: {
        sphere: { id: 'sphere' },
        rubric: { id: 'deleted' },
      },
    });
    await act(ctx.service, 'approve');
    await act(ctx.service, 'save', 2);

    const [, record] = ctx.posts.createManagedPostRecord.mock
      .calls[0] as unknown as [unknown, Record<string, unknown>];
    expect(record.aiPostingRubricId).toBeUndefined();
    expect(record.title).toBe('Approved title');
  });

  it.each([
    ['PENDING', 'PENDING'],
    ['EDITED', 'EDITED'],
    ['REJECTED', 'REJECTED'],
  ])('%s cannot save without approval', async (_label, status) => {
    const ctx = setup({ status });
    await expect(act(ctx.service, 'save')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(ctx.posts.prepareManagedPostCreate).not.toHaveBeenCalled();
    expect(ctx.posts.createManagedPostRecord).not.toHaveBeenCalled();
  });

  it('requires rejected content to be edited and approved before saving', async () => {
    const ctx = setup({ status: 'REJECTED', rejectionReason: 'Needs work' });
    const edited = await act(ctx.service, 'edit', 1, 'Revised approved text');
    const editedPublication = edited.publications[0] as {
      status: string;
      rejectionReason: string | null;
    };
    expect(editedPublication).toMatchObject({
      status: 'EDITED',
      rejectionReason: null,
    });
    await act(ctx.service, 'approve', 2);
    await act(ctx.service, 'save', 3);
    const savedItems = (
      ctx.storedRun.publications as { items: Array<Record<string, unknown>> }
    ).items;
    expect(savedItems[0]).toMatchObject({
      status: 'SAVED_DRAFT',
      text: 'Revised approved text',
    });
  });

  it('does not allow direct approval of rejected content', async () => {
    const ctx = setup({ status: 'REJECTED', rejectionReason: 'No' });
    await expect(act(ctx.service, 'approve')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(ctx.storedRun.version).toBe(1);
  });

  it('preserves run-level diagnostics through rejection, editing and approval', async () => {
    const ctx = setup();
    await act(ctx.service, 'reject', 1, 'Review again');
    expect(
      (ctx.storedRun.publications as { sourceDiagnostics: unknown[] })
        .sourceDiagnostics,
    ).toEqual([diagnostic]);
    await act(ctx.service, 'edit', 2, 'Updated text');
    expect(
      (ctx.storedRun.publications as { sourceDiagnostics: unknown[] })
        .sourceDiagnostics,
    ).toEqual([diagnostic]);
    await act(ctx.service, 'approve', 3);
    expect(
      (ctx.storedRun.publications as { sourceDiagnostics: unknown[] })
        .sourceDiagnostics,
    ).toEqual([diagnostic]);
  });

  it('editing approved content invalidates approval and clears rejection state', async () => {
    const ctx = setup({ status: 'APPROVED', rejectionReason: 'Old reason' });
    const edited = await act(ctx.service, 'edit', 1, 'Changed after approval');
    expect(edited.publications[0]).toMatchObject({
      status: 'EDITED',
      rejectionReason: null,
    });
    await expect(act(ctx.service, 'save', 2)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('adds missing media in place and clears only its old media failure', async () => {
    const ctx = setup({
      imageUrl: null,
      imageSourceId: null,
      mediaReadiness: 'FAILED',
      mediaFailureCode: 'AI_REQUEST_BUDGET_EXCEEDED',
    });
    ctx.storedRun.failures = [
      { topic: 'Editorial topic', code: 'AI_REQUEST_BUDGET_EXCEEDED' },
      { topic: 'Other topic', code: 'AI_POSTING_REVIEW_REJECTED' },
    ];
    ctx.prisma.telegramAiPostingSettings.findFirst.mockResolvedValue({
      id: 'settings',
      configuration: {},
      configurationVersion: 4,
      aiDailyBudget: null,
      aiMonthlyBudget: null,
      telegramChannel: null,
    });
    ctx.images.resolve.mockResolvedValue({
      image: { url: 'https://media.example/new.jpg', sourceId: 'new-source' },
      readiness: 'READY',
    });
    const result = await act(ctx.service, 'regenerate-image');
    expect(result.publications[0]).toMatchObject({
      text: 'Approved text',
      imageUrl: 'https://media.example/new.jpg',
      mediaReadiness: 'READY',
    });
    expect(ctx.storedRun.failures).toEqual([
      { topic: 'Other topic', code: 'AI_POSTING_REVIEW_REJECTED' },
    ]);
    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('uses the saved media preference references and channel avatar when retrying media', async () => {
    const ctx = setup({
      imageUrl: null,
      imageSourceId: null,
      mediaReadiness: 'FAILED',
      mediaPreference: { id: 'style-a', name: 'Illustration' },
    });
    ctx.prisma.telegramAiPostingSettings.findFirst.mockResolvedValue({
      id: 'settings',
      configuration: {
        useChannelAvatarInMedia: true,
        mediaPreferences: [
          {
            id: 'style-a',
            name: 'Illustration',
            description: '',
            references: ['https://media.example/reference.jpg'],
          },
        ],
      },
      configurationVersion: 4,
      aiDailyBudget: null,
      aiMonthlyBudget: null,
      telegramChannel: { photoUrl: 'data:image/png;base64,example' },
    });
    ctx.images.resolve.mockResolvedValue({
      image: { url: 'https://media.example/new.jpg', sourceId: 'ai' },
      readiness: 'READY',
    });
    const result = await act(ctx.service, 'regenerate-image');
    expect(ctx.images.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceImageUrls: ['https://media.example/reference.jpg'],
        channelAvatarUrl: 'data:image/png;base64,example',
        watermarkChannelAvatar: true,
      }),
    );
    expect(result.publications[0]).toMatchObject({
      mediaPreference: { id: 'style-a', name: 'Illustration' },
    });
  });

  it('regenerating an approved image resets approval and rejection state', async () => {
    const ctx = setup({ status: 'APPROVED', rejectionReason: 'Old reason' });
    ctx.prisma.telegramAiPostingSettings.findFirst.mockResolvedValue({
      configuration: {},
      configurationVersion: 4,
      aiDailyBudget: null,
      aiMonthlyBudget: null,
    });
    ctx.images.resolve.mockResolvedValue({
      image: { url: 'https://media.example/new.jpg', sourceId: 'new-source' },
      readiness: 'READY',
    });
    const regenerated = await act(
      ctx.service,
      'regenerate-image',
      1,
      'Use a warm, quiet palette',
    );
    expect(ctx.images.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        revisionDirection: 'Use a warm, quiet palette',
      }),
    );
    expect(regenerated.publications[0]).toMatchObject({
      status: 'PENDING',
      rejectionReason: null,
      imageUrl: 'https://media.example/new.jpg',
    });
    await expect(act(ctx.service, 'save', 2)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects text overrides during save instead of saving unapproved local text', async () => {
    const ctx = setup({ status: 'APPROVED' });
    await expect(
      act(ctx.service, 'save', 1, 'Unapproved local override'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(ctx.posts.createManagedPostRecord).not.toHaveBeenCalled();
  });

  it('refuses to save approved text over Telegram length limits for its media', async () => {
    const ctx = setup({ status: 'APPROVED', text: 'x'.repeat(1025) });
    await expect(act(ctx.service, 'save')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(ctx.posts.createManagedPostRecord).not.toHaveBeenCalled();
  });

  it('cannot mutate or save an already saved preview again', async () => {
    const ctx = setup({ status: 'SAVED_DRAFT', savedPostId: 'existing-post' });
    await expect(act(ctx.service, 'save')).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(act(ctx.service, 'edit', 1, 'Changed')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(ctx.posts.createManagedPostRecord).not.toHaveBeenCalled();
  });

  it('uses the version compare-and-swap to let only one concurrent save create a draft', async () => {
    const ctx = setup({ status: 'APPROVED' });
    const results = await Promise.allSettled([
      act(ctx.service, 'save'),
      act(ctx.service, 'save'),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(ctx.posts.createManagedPostRecord).toHaveBeenCalledTimes(1);
    expect(ctx.storedRun.version).toBe(3);
    const savedItems = (
      ctx.storedRun.publications as { items: Array<Record<string, unknown>> }
    ).items;
    expect(savedItems[0]?.savedPostId).toBe('managed-post-1');
  });

  it('rejects stale expected versions before creating a draft', async () => {
    const ctx = setup({ status: 'APPROVED' });
    await expect(act(ctx.service, 'save', 2)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(ctx.posts.createManagedPostRecord).not.toHaveBeenCalled();
  });

  it('keeps workspace and channel isolation on review reads', async () => {
    const ctx = setup();
    ctx.prisma.telegramAiPostingTestRun.findFirst.mockResolvedValue(null);
    await expect(act(ctx.service, 'approve')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(ctx.prisma.telegramAiPostingTestRun.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'run-1',
        workspaceId: 'workspace-1',
        telegramChannelId: 'channel-1',
      },
    });
  });

  it('clears history and cancels background tests without deleting recent autopilot runs', async () => {
    const ctx = setup();
    await expect(
      ctx.service.clearHistory('user-1', 'channel-1'),
    ).resolves.toEqual({ deletedCount: 2 });
    expect(ctx.workspace.resolveWorkspaceIdForUser).toHaveBeenCalledWith(
      'user-1',
    );
    const deleteArgs = ctx.prisma.telegramAiPostingTestRun.deleteMany.mock
      .calls[0]?.[0] as { where: Record<string, unknown> };
    expect(deleteArgs.where).toMatchObject({
      workspaceId: 'workspace-1',
      telegramChannelId: 'channel-1',
      OR: [
        { status: { not: 'RUNNING' } },
        { status: 'RUNNING', publications: { path: ['background'], equals: true } },
        { status: 'RUNNING', updatedAt: { lt: expect.any(Date) } },
      ],
    });
  });

  it('only stops running background tests owned by the selected workspace and channel', async () => {
    const ctx = setup();
    ctx.prisma.telegramAiPostingTestRun.findFirst.mockResolvedValueOnce({
      ...ctx.storedRun, status: 'CANCELED', publications: [],
    });
    await expect(ctx.service.stopRun('user-1', 'channel-1', 'run-1'))
      .resolves.toEqual({ status: 'CANCELED' });
    expect(ctx.prisma.telegramAiPostingTestRun.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'run-1', workspaceId: 'workspace-1', telegramChannelId: 'channel-1',
        status: 'RUNNING', publications: { path: ['background'], equals: true },
      },
      data: { status: 'CANCELED', version: { increment: 1 } },
    });
  });

  it('preserves image readiness, operations, costs, provenance and diagnostics when saving', async () => {
    const ctx = setup({ status: 'APPROVED' });
    await act(ctx.service, 'save');
    expect(ctx.storedRun.publications).toMatchObject({
      sourceDiagnostics: [diagnostic],
      items: [
        {
          status: 'SAVED_DRAFT',
          mediaReadiness: 'READY',
          imageUrl: 'https://media.example/approved.jpg',
          operations: [expect.objectContaining({ operationId: 'image-op' })],
          costs: {
            planning: '0.01',
            text: '0.02',
            image: '0.03',
            review: '0.04',
          },
          ideaSources: [{ id: 'source-1', type: 'rss', value: 'feed.example' }],
        },
      ],
    });
    expect(ctx.tx.telegramAiPostingGeneration.create).toHaveBeenCalled();
    expect(ctx.tx.aiOperation.updateMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-1',
        aiPostingTestRunId: 'run-1',
        aiPostingPublicationIndex: 0,
      },
      data: { aiPostingManagedPostId: 'managed-post-1' },
    });
  });

  it('reads and updates historical array-form records', async () => {
    const ctx = setup({ status: 'PENDING' });
    ctx.storedRun.publications = [publication({ status: 'PENDING' })];
    const edited = await act(ctx.service, 'edit', 1, 'Historical edited text');
    expect(edited.publications[0]).toMatchObject({
      text: 'Historical edited text',
      status: 'EDITED',
    });
    expect(ctx.storedRun.publications).toMatchObject({
      items: [{ text: 'Historical edited text', status: 'EDITED' }],
    });
  });
});
