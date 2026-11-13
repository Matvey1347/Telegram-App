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
    const structure = {
      resolveForDraft: jest.fn().mockResolvedValue({
        groupId: 'group-1',
        hypothesisId: 'hypothesis-1',
      }),
    };
    const service = new TelegramAiPostingTestRunService(
      prisma as never,
      workspace as never,
      gateway as never,
      posts as never,
      revisions as never,
      images as never,
      structure as never,
    );
    return {
      service,
      prisma,
      workspace,
      posts,
      gateway,
      revisions,
      images,
      structure,
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

  it('creates and attaches allowed groups and hypotheses inside the draft transaction', async () => {
    const ctx = setup({ format: 'New group', category: 'New hypothesis' });
    ctx.tx.$queryRaw.mockResolvedValue([
      {
        configuration: { allowCreateGroups: true, allowCreateHypotheses: true },
      },
    ]);
    await act(ctx.service, 'approve');
    await act(ctx.service, 'save', 2);
    expect(ctx.structure.resolveForDraft).toHaveBeenCalledWith(
      ctx.tx,
      expect.objectContaining({
        workspaceId: 'workspace-1',
        channelId: 'channel-1',
        memberId: 'member-1',
        format: 'New group',
        category: 'New hypothesis',
        allowGroups: true,
        allowHypotheses: true,
      }),
    );
    expect(ctx.posts.createManagedPostRecord).toHaveBeenCalledWith(
      ctx.tx,
      expect.objectContaining({ groupId: 'group-1' }),
    );
    expect(
      ctx.tx.telegramManagedPostContentHypothesis.create,
    ).toHaveBeenCalledWith({
      data: { managedPostId: 'managed-post-1', hypothesisId: 'hypothesis-1' },
    });
  });

  it('recognizes explicitly selected groups and hypotheses named standard or general', async () => {
    const ctx = setup({ format: 'standard', category: 'general' });
    ctx.tx.$queryRaw.mockResolvedValue([
      { configuration: { formats: ['standard'], categories: ['general'] } },
    ]);
    await act(ctx.service, 'approve');
    await act(ctx.service, 'save', 2);
    expect(ctx.structure.resolveForDraft).toHaveBeenCalledWith(
      ctx.tx,
      expect.objectContaining({
        format: 'standard',
        category: 'general',
        allowGroups: false,
        allowHypotheses: false,
      }),
    );
  });

  it('does not create fallback names when auto creation is enabled', async () => {
    const ctx = setup();
    ctx.tx.$queryRaw.mockResolvedValue([
      {
        configuration: {
          allowCreateGroups: true,
          allowCreateHypotheses: true,
          formats: [],
          categories: [],
        },
      },
    ]);
    await act(ctx.service, 'approve');
    await act(ctx.service, 'save', 2);
    expect(ctx.structure.resolveForDraft).not.toHaveBeenCalled();
  });

  it('does not associate unselected names when automatic creation is disabled', async () => {
    const ctx = setup({
      format: 'Unselected group',
      category: 'Unselected hypothesis',
    });
    ctx.tx.$queryRaw.mockResolvedValue([
      {
        configuration: {
          formats: ['Selected group'],
          categories: ['Selected hypothesis'],
          allowCreateGroups: false,
          allowCreateHypotheses: false,
        },
      },
    ]);
    await act(ctx.service, 'approve');
    await act(ctx.service, 'save', 2);
    expect(ctx.structure.resolveForDraft).not.toHaveBeenCalled();
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
        prompt: expect.stringContaining('Use a warm, quiet palette'),
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

  it('clears history for the active workspace/channel and preserves recent running work', async () => {
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
        { status: 'RUNNING', updatedAt: { lt: expect.any(Date) } },
      ],
    });
  });

  it('preserves image readiness, operations, costs, provenance and diagnostics when saving', async () => {
    const ctx = setup({
      status: 'APPROVED',
      mediaReadiness: 'MISSING',
      imageUrl: null,
    });
    await act(ctx.service, 'save');
    expect(ctx.storedRun.publications).toMatchObject({
      sourceDiagnostics: [diagnostic],
      items: [
        {
          status: 'SAVED_DRAFT',
          mediaReadiness: 'MISSING',
          imageUrl: null,
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
