import { BadGatewayException, ConflictException } from '@nestjs/common';
import { TelegramAiPostingGeneratorService } from './telegram-ai-posting-generator.service';
import { TelegramAiPostingTestRunService } from './telegram-ai-posting-test-run.service';

describe('TelegramAiPostingGeneratorService', () => {
  const workspace = {
    resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('ws-1'),
  };
  const prisma = {
    telegramAiPostingSettings: { findFirst: jest.fn() },
    telegramAiPostingTestRun: {
      create: jest.fn().mockResolvedValue({ id: 'run-1', version: 1 }),
      update: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const gateway = { execute: jest.fn() };
  const sources = { collect: jest.fn() };
  const planningContext = { read: jest.fn() };
  const posts = {
    prepareManagedPostCreate: jest.fn(),
    createManagedPostRecord: jest.fn(),
  };
  const revisions = { createManagedPostRevision: jest.fn() };
  const images = { resolve: jest.fn() };
  const service = new TelegramAiPostingGeneratorService(
    prisma as never,
    workspace as never,
    gateway as never,
    sources as never,
    planningContext as never,
    images as never,
  );
  const testRuns = new TelegramAiPostingTestRunService(
    prisma as never,
    workspace as never,
    gateway as never,
    posts as never,
    revisions as never,
    images as never,
  );
  beforeEach(() => jest.clearAllMocks());

  it('rejects counts outside one through five before reading or calling AI', async () => {
    await expect(
      service.generate('user-1', 'channel-1', 6),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.telegramAiPostingSettings.findFirst).not.toHaveBeenCalled();
    expect(gateway.execute).not.toHaveBeenCalled();
  });

  it('does not create a managed post when planning fails', async () => {
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue({
      configuration: {},
      configurationVersion: 1,
    });
    sources.collect.mockResolvedValue({
      editorialProfile: {},
      sourceContexts: [],
      existingPosts: [],
      history: [],
      imageCandidates: [],
      sourceRefs: [],
    });
    planningContext.read.mockResolvedValue({ schedule: null, hypotheses: [] });
    gateway.execute.mockResolvedValue({
      operation: {
        operationId: 'op-failed',
        category: 'TELEGRAM_POSTING_PLAN',
        model: 'test-model',
        status: 'FAILED',
        errorCategory: 'PROVIDER_ERROR',
        actualCost: '0.025',
        pricingStatus: 'PRICED',
        inputTokens: 20,
        outputTokens: 3,
      },
      result: null,
    });
    await expect(
      service.generate('user-1', 'channel-1', 1),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(posts.prepareManagedPostCreate).not.toHaveBeenCalled();
    expect(posts.createManagedPostRecord).not.toHaveBeenCalled();
    expect(prisma.telegramAiPostingTestRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run-1' },
        data: expect.objectContaining({
          status: 'FAILED',
          planningCost: expect.anything(),
          operations: expect.arrayContaining([
            expect.objectContaining({ status: 'FAILED', actualCost: '0.025' }),
          ]),
        }),
      }),
    );
  });

  it('rejects stale concurrent review actions before writing', async () => {
    workspace.resolveWorkspaceIdForUser.mockResolvedValue('ws-1');
    prisma.telegramAiPostingTestRun.findFirst.mockResolvedValue({
      id: 'run-1',
      workspaceId: 'ws-1',
      telegramChannelId: 'channel-1',
      version: 4,
      publications: [],
      feedback: [],
      operations: [],
    });
    await expect(
      testRuns.reviewPublication(
        'user-1',
        'channel-1',
        'run-1',
        0,
        3,
        'approve',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.telegramAiPostingTestRun.updateMany).not.toHaveBeenCalled();
  });

  it('requires a reason when rejecting a test publication', async () => {
    workspace.resolveWorkspaceIdForUser.mockResolvedValue('ws-1');
    prisma.telegramAiPostingTestRun.findFirst.mockResolvedValue({
      id: 'run-1',
      workspaceId: 'ws-1',
      telegramChannelId: 'channel-1',
      version: 2,
      publications: [{ topic: 'topic', status: 'PENDING' }],
      feedback: [],
      operations: [],
    });
    await expect(
      testRuns.reviewPublication(
        'user-1',
        'channel-1',
        'run-1',
        0,
        2,
        'reject',
        '  ',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.telegramAiPostingTestRun.updateMany).not.toHaveBeenCalled();
  });

  it('persists successful previews in the test run without creating calendar drafts', async () => {
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue({
      configuration: { imageMode: 'found', formats: [], categories: [] },
      configurationVersion: 7,
    });
    sources.collect.mockResolvedValue({
      editorialProfile: { language: 'English' },
      sourceContexts: [],
      existingPosts: [],
      history: [],
      imageCandidates: [],
      sourceRefs: [],
    });
    planningContext.read.mockResolvedValue({ schedule: null, hypotheses: [] });
    const replies = [
      '{"topics":["A distinct editorial topic"]}',
      '{"title":"A clear title","text":"A useful post","imagePrompt":"Editorial image"}',
      '{"approved":true,"reasons":[]}',
    ];
    gateway.execute.mockImplementation(
      async (request: { category: string }) => ({
        operation: {
          operationId: `op-${gateway.execute.mock.calls.length}`,
          category: request.category,
          model: 'test-model',
          status: 'SUCCEEDED',
          actualCost: null,
          pricingStatus: 'UNKNOWN',
          inputTokens: 10,
          outputTokens: 10,
        },
        result: { reply: replies.shift() },
      }),
    );
    images.resolve.mockResolvedValue({ image: null });

    const result = await service.generate('user-1', 'channel-1', 1);

    expect(result.generated).toHaveLength(1);
    expect(result.generated[0]).toMatchObject({
      status: 'PENDING',
      title: 'A clear title',
      costs: { planning: null, text: null, image: '0', review: null },
    });
    expect(gateway.execute.mock.calls[0][0].aiPosting).toMatchObject({
      channelId: 'channel-1',
      testRunId: 'run-1',
      postingMode: 'TEST',
    });
    expect(prisma.telegramAiPostingTestRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run-1' },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
    expect(posts.createManagedPostRecord).not.toHaveBeenCalled();
    expect(posts.prepareManagedPostCreate).not.toHaveBeenCalled();
  });

  it('edits a three-post preview and saves one publication with its AI ledger link', async () => {
    const publication = {
      topic: 'A distinct topic for the channel',
      title: 'Original title',
      text: 'Original text',
      imagePrompt: 'Editorial image',
      imageUrl: null,
      imageSourceId: null,
      format: 'standard',
      category: 'general',
      reviewNotes: [],
      costs: { planning: '0.03', text: '0.04', image: '0', review: '0.01' },
      operations: [],
      ideaSources: [{ id: 'source-1', type: 'rss', value: 'https://example.test/feed' }],
      status: 'PENDING',
      rejectionReason: null,
      savedPostId: null,
    };
    const persistedRun: any = {
      id: 'test-run-1',
      workspaceId: 'ws-1',
      telegramChannelId: 'channel-1',
      version: 1,
      settingsVersion: 8,
      status: 'COMPLETED',
      publications: [publication, { ...publication, topic: 'Second distinct topic' }, { ...publication, topic: 'Third distinct topic' }],
      operations: [{ operationId: 'op-1', stage: 'text', actualCost: '0.04' }],
      feedback: [],
    };
    prisma.telegramAiPostingTestRun.findFirst.mockImplementation(async () => persistedRun);
    prisma.telegramAiPostingTestRun.updateMany.mockImplementation(async ({ where, data }: any) => {
      if (where.version !== persistedRun.version) return { count: 0 };
      const { version, ...rest } = data;
      Object.assign(persistedRun, rest);
      if (version?.increment) persistedRun.version += version.increment;
      return { count: 1 };
    });
    posts.prepareManagedPostCreate.mockResolvedValue({ prepared: true });
    posts.createManagedPostRecord.mockResolvedValue({ id: 'managed-post-1' });
    const tx: any = {
      telegramAiPostingTestRun: {
        updateMany: jest.fn(async ({ where, data }: any) => {
          if (where.version !== persistedRun.version) return { count: 0 };
          if (data.version?.increment) persistedRun.version += data.version.increment;
          return { count: 1 };
        }),
      },
      telegramAiPostingGeneration: { create: jest.fn() },
      aiOperation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    (prisma as any).$transaction = jest.fn((callback: any) => callback(tx));

    const edited = await testRuns.reviewPublication(
      'user-1', 'channel-1', 'test-run-1', 0, 1, 'edit', 'Revised post text',
    );
    expect(edited.version).toBe(2);
    expect(edited.publications?.[0].text).toBe('Revised post text');
    expect(edited.publications?.[0].ideaSources).toEqual(publication.ideaSources);

    const saved = await testRuns.reviewPublication(
      'user-1', 'channel-1', 'test-run-1', 0, 2, 'save',
    );
    expect(saved.publications?.[0]).toMatchObject({
      status: 'SAVED_DRAFT',
      savedPostId: 'managed-post-1',
    });
    expect(tx.aiOperation.updateMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'ws-1',
        aiPostingTestRunId: 'test-run-1',
        aiPostingPublicationIndex: 0,
      },
      data: { aiPostingManagedPostId: 'managed-post-1' },
    });
    expect(tx.telegramAiPostingGeneration.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ managedPostId: 'managed-post-1' }),
      }),
    );
  });
});
