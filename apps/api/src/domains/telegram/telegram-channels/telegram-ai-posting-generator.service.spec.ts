import { BadGatewayException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { telegramAiPostingBatchExecutor } from './telegram-ai-posting-generation-invoke';
import { TelegramAiPostingGeneratorService } from './telegram-ai-posting-generator.service';
import { TelegramAiPostingTestRunService } from './telegram-ai-posting-test-run.service';
import { TelegramAiPostingController } from './telegram-ai-posting.controller';
import { renderTelegramAiPostingText } from './telegram-ai-posting-render';
import { telegramAiPostingEditorialSelection } from './telegram-ai-posting-editorial-selection';
import { telegramAiPostingPlanPrompt } from './telegram-ai-posting-topic-plan';
import { telegramAiPostingGenerationFailures } from './telegram-ai-posting-generation-outcome';
import {
  parseTelegramAiPostingJson,
  parseTelegramAiPostingDraft,
} from './telegram-ai-posting-json';

describe('TelegramAiPostingGeneratorService', () => {
  const workspace = {
    resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('ws-1'),
  };
  const prisma = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    telegramChannel: { findFirst: jest.fn() },
    telegramPost: { findMany: jest.fn() },
    telegramAiPostingSettings: {
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    telegramAiPostingSettingsVersion: {
      create: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
      callback(prisma),
    ),
    telegramAiPostingTestRun: {
      create: jest.fn().mockResolvedValue({ id: 'run-1', version: 1 }),
      aggregate: jest.fn().mockResolvedValue({ _sum: { requestedCount: 0 } }),
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
  const images = {
    resolve: jest.fn(),
    prepareReferenceSheet: jest.fn(),
    prepareChannelAvatar: jest.fn(),
  };
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
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((callback) => callback(prisma));
    prisma.telegramAiPostingTestRun.aggregate.mockResolvedValue({
      _sum: { requestedCount: 0 },
    });
    images.prepareReferenceSheet.mockResolvedValue({
      image: null,
      failed: false,
    });
    images.prepareChannelAvatar.mockResolvedValue(null);
    prisma.telegramAiPostingTestRun.findMany.mockResolvedValue([]);
    prisma.telegramAiPostingTestRun.updateMany.mockReset().mockResolvedValue({ count: 1 });
  });

  it('rotates neglected subspheres and configured lengths across repeated batches', () => {
    const config = {
      spheres: [
        { id: 'health', name: 'Health', tier: 'PRIMARY' },
        { id: 'food', parentId: 'health', mediaPreferenceId: 'meal' },
        { id: 'sleep', parentId: 'health', mediaPreferenceId: 'bedroom' },
        { id: 'prevention', parentId: 'health', mediaPreferenceId: 'medical' },
      ],
      rubrics: [{ id: 'notes' }, { id: 'evidence', sphereId: 'prevention' }],
      lengths: [
        { id: 'quote', maxCharacters: 99 },
        { id: 'short', minCharacters: 100, maxCharacters: 300 },
        { id: 'medium', minCharacters: 301, maxCharacters: 700 },
        { id: 'long', minCharacters: 701, maxCharacters: 1600 },
        { id: 'deep', minCharacters: 1601, maxCharacters: 2000 },
      ],
    };
    const recent: Array<ReturnType<typeof telegramAiPostingEditorialSelection>> = [
      { sphere: config.spheres[1], parentSphere: config.spheres[0], rubric: null, lengths: [] },
    ];
    const assigned = Array.from({ length: 8 }, (_, index) => {
      const selection = telegramAiPostingEditorialSelection(config, index, index, recent);
      recent.push(selection);
      return selection;
    });
    expect(assigned[0].sphere.id).not.toBe('food');
    expect(new Set(assigned.map(({ sphere }) => sphere.mediaPreferenceId))).toEqual(new Set(['meal', 'bedroom', 'medical']));
    expect(new Set(assigned.map(({ lengths }) => lengths[0].id))).toEqual(new Set(['quote', 'short', 'medium', 'long', 'deep']));
    expect(assigned.every(({ parentSphere }) => parentSphere?.id === 'health')).toBe(true);
    expect(assigned.filter(({ rubric }) => rubric?.id === 'evidence').every(({ sphere }) => sphere.id === 'prevention')).toBe(true);
  });

  it('replans repeated topics and searches for the subsphere’s assigned real image even in AI mode', async () => {
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue({
      configuration: {
        language: 'en', imageMode: 'ai',
        spheres: [
          { id: 'culture', name: 'Culture', tier: 'PRIMARY' },
          { id: 'biography', name: 'Prominent authors', parentId: 'culture', mediaPreferenceId: 'portraits' },
        ],
        mediaPreferences: [
          { id: 'portraits', name: 'Real portraits', purpose: 'SEARCH', searchDescription: 'Locate a real photograph of the named author' },
          { id: 'lifestyle', name: 'Lifestyle', purpose: 'GENERATION' },
        ],
      },
      configurationVersion: 1,
    });
    prisma.telegramAiPostingTestRun.findMany.mockResolvedValue([
      { publications: [{ topic: 'How authors find their voice' }] },
    ]);
    sources.collect.mockResolvedValue({
      editorialProfile: { language: 'English' }, history: [], existingPosts: [],
      sourceContexts: [], imageCandidates: [], sourceRefs: [],
    });
    planningContext.read.mockResolvedValue({ schedule: null, hypotheses: [] });
    const topics = ['How authors find their voice', 'How Jane Austen uses free indirect speech'];
    gateway.execute.mockImplementation(({ category }) => ({
      operation: { category, model: 'test', status: 'SUCCEEDED', actualCost: '0.01', pricingStatus: 'PRICED' },
      result: { reply: category === 'TELEGRAM_POSTING_PLAN'
        ? JSON.stringify({ topics: [topics.shift()] })
        : category === 'TELEGRAM_POSTING_REVIEW' ? '{"approved":true,"reasons":[]}'
          : '{"title":"Jane Austen’s narrative voice","text":"Notice how a character’s vocabulary enters the narration.","imageSearchQuery":"Jane Austen portrait, Jane Austen engraving, Jane Austen museum portrait","imageStyleIndex":0}' },
    }));
    images.resolve.mockResolvedValue({
      image: { url: 'https://media.example/austen.jpg', sourceId: 'wikimedia-commons' }, readiness: 'READY',
    });

    const result = await service.generate('user-1', 'channel-1', 1);
    const plans = gateway.execute.mock.calls.filter(([call]) => call.category === 'TELEGRAM_POSTING_PLAN');
    expect(plans).toHaveLength(2);
    expect(plans[0][0].input).toContain('"subSphere":"Prominent authors"');
    expect(result.generated[0].editorialMetadata?.sphere?.id).toBe('biography');
    expect(result.generated[0].mediaPreference?.id).toBe('portraits');
    expect(images.resolve).toHaveBeenCalledWith(expect.objectContaining({
      imageMode: 'found', fallbackToGeneration: false,
      searchQuery: expect.stringContaining('Jane Austen portrait'),
      searchDescription: 'Locate a real photograph of the named author',
    }));
  });

  it('processes ten slots in one run and normalizes emoji votes and media links', async () => {
    const count = 10;
    const topics = Array.from({ length: count }, (_, index) => `Editorial topic number ${index + 1}`);
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue({
      configuration: {
        language: 'en', imageMode: 'ai', emojiPolicy: 'start',
        rubrics: [{ id: 'vote', name: 'Two reactions', lengthIds: [] }],
      },
      configurationVersion: 1,
    });
    sources.collect.mockResolvedValue({
      editorialProfile: { language: 'English' }, sourceContexts: [],
      existingPosts: [], history: [], imageCandidates: [], sourceRefs: [],
    });
    planningContext.read.mockResolvedValue({ schedule: null, hypotheses: [] });
    gateway.execute.mockImplementation(({ category, aiPosting }) => ({
      operation: { category, model: 'test', status: 'SUCCEEDED', actualCost: '0.01', pricingStatus: 'PRICED' },
      result: { reply: category === 'TELEGRAM_POSTING_PLAN'
        ? JSON.stringify({ topics })
        : category === 'TELEGRAM_POSTING_REVIEW' ? '{"approved":true,"reasons":[]}'
          : JSON.stringify({
              title: topics[aiPosting.publicationIndex],
              text: aiPosting.publicationIndex === 9
                ? 'Which step would you take?'
                : `Which step would you take for topic ${aiPosting.publicationIndex + 1}?\n\n- 👍: Save it\n- 💬 – Share it\n\n![Image](https://images.example/photo.jpg)`,
              ...(aiPosting.publicationIndex === 9 ? { voteOptions: ['Save it', 'Share it'] } : {}),
            }) },
    }));
    let releaseImages!: () => void;
    const blockedImages = new Promise<void>((resolve) => { releaseImages = resolve; });
    let onMediaFull!: () => void;
    const mediaFull = new Promise<void>((resolve) => { onMediaFull = resolve; });
    images.resolve.mockImplementation(async ({ aiPosting }) => {
      if (images.resolve.mock.calls.length === 5) onMediaFull();
      await blockedImages;
      return {
        image: { url: `https://media.example/${aiPosting.publicationIndex}.jpg`, sourceId: 'image-provider' },
        readiness: 'READY',
      };
    });
    const onProgress = jest.fn();
    const generation = service.generate('user-1', 'channel-1', count, 'MANUAL', undefined, onProgress);
    try {
      await mediaFull;
      expect(images.resolve).toHaveBeenCalledTimes(5);
      const textStarts = onProgress.mock.calls.filter(([event]) => event.stage === 'text' && event.status === 'RUNNING');
      expect(new Set(textStarts.map(([event]) => event.publicationIndex)).size).toBe(count);
    } finally {
      releaseImages();
    }
    const result = await generation;
    expect(result.failures).toEqual([]);
    expect(onProgress.mock.calls.filter(([event]) => event.stage === 'publication' && event.status === 'COMPLETED')
      .map(([event]) => event.publicationIndex).sort((a, b) => a - b)).toEqual(topics.map((_, index) => index));
    expect(result.generated.map(({ topic }) => topic)).toEqual(topics);
    expect(result.generated[9].text).toContain('👍 — Save it');
    expect(result.generated[9].text).toContain('💬 — Share it');
    expect(result.generated[0].text).toContain('👍 — Save it');
    expect(result.generated[0].text).not.toContain('images.example');
    expect(prisma.telegramAiPostingTestRun.create).toHaveBeenCalledTimes(1);
  });

  it('rejects counts outside one through ten before reading or calling AI', async () => {
    await expect(
      service.generate('user-1', 'channel-1', 11),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.telegramAiPostingSettings.findFirst).not.toHaveBeenCalled();
    expect(gateway.execute).not.toHaveBeenCalled();
  });

  it('returns an accepted run before source collection finishes and settles it afterward', async () => {
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue({
      configuration: {}, configurationVersion: 1,
    });
    prisma.telegramAiPostingTestRun.findFirst.mockResolvedValue(null);
    let rejectSource!: (reason: Error) => void;
    sources.collect.mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectSource = reject;
    }));
    const controller = new TelegramAiPostingController(
      {} as never, service, testRuns, {} as never, {} as never, {} as never,
    );

    await expect(controller.generateInBackground({ sub: 'user-1' } as never, 'channel-1', { count: 1 }))
      .resolves.toEqual({ runId: 'run-1' });
    expect(prisma.telegramAiPostingTestRun.update).not.toHaveBeenCalled();
    const settled = new Promise<unknown>((resolve) => {
      prisma.telegramAiPostingTestRun.update.mockImplementationOnce(async (args) => {
        resolve(args);
        return {};
      });
    });
    rejectSource(new Error('Source collection failed'));
    await expect(settled).resolves.toMatchObject({
      where: { id: 'run-1', status: 'RUNNING' }, data: { status: 'FAILED' },
    });
  });

  it('accepts an existing active batch without issuing new source or model requests', async () => {
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue({
      configuration: {}, configurationVersion: 1,
    });
    prisma.telegramAiPostingTestRun.findFirst.mockResolvedValueOnce({ id: 'active-run', version: 1 });
    const controller = new TelegramAiPostingController(
      {} as never, service, testRuns, {} as never, {} as never, {} as never,
    );

    await expect(controller.generateInBackground({ sub: 'user-1' } as never, 'channel-1', { count: 1 }))
      .resolves.toEqual({ runId: 'active-run' });
    expect(prisma.telegramAiPostingTestRun.create).not.toHaveBeenCalled();
    expect(sources.collect).not.toHaveBeenCalled();
    expect(gateway.execute).not.toHaveBeenCalled();
  });

  it('continues a background batch to completion after returning the run ID', async () => {
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue({
      configuration: { language: 'en', imageMode: 'ai' }, configurationVersion: 1,
    });
    prisma.telegramAiPostingTestRun.findFirst.mockResolvedValue(null);
    prisma.telegramAiPostingTestRun.updateMany.mockResolvedValue({ count: 1 });
    planningContext.read.mockResolvedValue({ schedule: null, hypotheses: [] });
    let finishSources!: () => void;
    sources.collect.mockImplementationOnce(() => new Promise((resolve) => {
      finishSources = () => resolve({
        editorialProfile: { language: 'English' }, sourceContexts: [],
        existingPosts: [], history: [], imageCandidates: [], sourceRefs: [],
      });
    }));
    const replies = [
      '{"topics":["A distinct editorial topic"]}',
      '{"title":"A clear title","text":"A useful post","imagePrompt":"Editorial image"}',
      '{"approved":true,"reasons":[]}',
    ];
    gateway.execute.mockImplementation(({ category }) => ({
      operation: {
        category, model: 'test-model', status: 'SUCCEEDED', actualCost: '0',
        pricingStatus: 'PRICED', inputTokens: 10, outputTokens: 10,
      },
      result: { reply: replies.shift() },
    }));
    images.resolve.mockResolvedValue({
      image: { url: 'https://media.example/ready.jpg', sourceId: 'source-1' }, readiness: 'READY',
    });
    const controller = new TelegramAiPostingController(
      {} as never, service, testRuns, {} as never, {} as never, {} as never,
    );
    const settled = new Promise<unknown>((resolve) => {
      prisma.telegramAiPostingTestRun.update.mockImplementationOnce(async (args) => {
        resolve(args);
        return {};
      });
    });

    await expect(controller.generateInBackground({ sub: 'user-1' } as never, 'channel-1', { count: 1 }))
      .resolves.toEqual({ runId: 'run-1' });
    expect(gateway.execute).not.toHaveBeenCalled();
    finishSources();
    await expect(settled).resolves.toMatchObject({
      where: { id: 'run-1', status: 'RUNNING' },
      data: {
        status: 'COMPLETED',
        publications: { items: [{ title: 'A clear title', imageUrl: 'https://media.example/ready.jpg' }] },
      },
    });
    expect(gateway.execute).toHaveBeenCalledTimes(3);
  });

  it('persists an out-of-order result while the first publication is still looking for media', async () => {
    const run = prisma.telegramAiPostingTestRun;
    run.findFirst.mockResolvedValue(null);
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue({
      configuration: { language: 'en', imageMode: 'found' }, configurationVersion: 1,
    });
    sources.collect.mockResolvedValue({
      editorialProfile: { language: 'English' }, sourceContexts: [],
      existingPosts: [], history: [], imageCandidates: [], sourceRefs: [],
    });
    planningContext.read.mockResolvedValue({ schedule: null, hypotheses: [] });
    gateway.execute.mockImplementation(({ category, aiPosting }) => ({
      operation: { category, model: 'test', status: 'SUCCEEDED', actualCost: '0.01', pricingStatus: 'PRICED' },
      result: { reply: category === 'TELEGRAM_POSTING_PLAN'
        ? '{"topics":["Conversations after work","Small habits at home"]}'
        : category === 'TELEGRAM_POSTING_REVIEW'
          ? '{"approved":true,"reasons":[]}'
          : JSON.stringify({ title: 'Editorial article', text: `Text for publication ${aiPosting.publicationIndex + 1}.` }),
      },
    }));
    let finishImage!: () => void;
    const slowImage = new Promise((resolve) => {
      finishImage = () => resolve({ image: null, readiness: 'FAILED', failureCode: 'AI_POSTING_IMAGE_PROVIDER_FAILED' });
    });
    let firstImageStarted = false;
    images.resolve.mockImplementation(async ({ aiPosting }) => {
      if (aiPosting.publicationIndex === 0) {
        firstImageStarted = true;
        return slowImage;
      }
      return { image: { url: 'https://media.example/second.jpg', sourceId: 'wikimedia-commons' }, readiness: 'READY' };
    });
    const secondSaved = new Promise<unknown>((resolve) => {
      run.updateMany.mockImplementation(async ({ data }) => {
        if (data.publications?.items.length === 1) resolve(data.publications);
        return { count: 1 };
      });
    });
    const generation = service.generate('user-1', 'channel-1', 2, 'MANUAL', undefined, undefined, undefined, undefined, jest.fn());
    try {
      expect(await secondSaved).toMatchObject({
        items: [{ publicationIndex: 1, imageUrl: 'https://media.example/second.jpg' }],
        progress: {
          publicationIndex: 0, stage: 'image', processed: 1, complete: 1,
          stages: { '0:image': 'RUNNING', '1:image': 'COMPLETED' },
        },
      });
      expect(firstImageStarted).toBe(true);
      expect(run.update).not.toHaveBeenCalled();
    } finally {
      finishImage();
    }
    const result = await generation;
    expect(result.generated.map(({ publicationIndex }) => publicationIndex)).toEqual([0, 1]);
    expect(result.failures).toMatchObject([{ publicationIndex: 0, code: 'AI_POSTING_IMAGE_PROVIDER_FAILED' }]);
    for (const publication of result.generated) {
      expect(publication.operations.filter(({ stage }) => stage !== 'planning'))
        .toEqual([
          expect.objectContaining({ stage: 'text', publicationIndex: publication.publicationIndex }),
          expect.objectContaining({ stage: 'review', publicationIndex: publication.publicationIndex }),
        ]);
    }
  });

  it('waits for an active sibling before retrying a pre-admission capacity rejection', async () => {
    let finishFirst!: () => void;
    const first = new Promise<void>((resolve) => { finishFirst = resolve; });
    let rejected!: () => void;
    const rejection = new Promise<void>((resolve) => { rejected = resolve; });
    const execute = jest.fn()
      .mockImplementationOnce(() => first)
      .mockImplementationOnce(() => {
        rejected();
        throw new ServiceUnavailableException('AI_CAPACITY_EXHAUSTED');
      })
      .mockResolvedValueOnce('second receipt');
    const request = { category: 'TELEGRAM_POSTING_TEXT' } as const;
    const queue = telegramAiPostingBatchExecutor(execute);
    const running = queue({ ...request, operationId: 'first' } as never);
    const waiting = queue({ ...request, operationId: 'second' } as never);
    await rejection;
    expect(execute).toHaveBeenCalledTimes(2);
    finishFirst();
    await running;
    await expect(waiting).resolves.toBe('second receipt');
    expect(execute.mock.calls.map(([operation]) => operation.operationId)).toEqual(['first', 'second', 'second']);
  });

  it('does not keep retrying when every sibling is also rejected before admission', async () => {
    const execute = jest.fn().mockRejectedValue(new ServiceUnavailableException('AI_CAPACITY_EXHAUSTED'));
    const queue = telegramAiPostingBatchExecutor(execute);
    const attempts = Array.from({ length: 10 }, (_, index) => queue({
      category: 'TELEGRAM_POSTING_TEXT', operationId: String(index),
    } as never));
    const results = await Promise.allSettled(attempts);
    expect(results).toEqual(Array(10).fill({
      status: 'rejected', reason: expect.objectContaining({ message: 'AI_CAPACITY_EXHAUSTED' }),
    }));
    expect(execute).toHaveBeenCalledTimes(10);
  });

  it('loads the assigned main invite link for the generated channel ending', async () => {
    prisma.telegramChannel.findFirst.mockResolvedValue({
      language: 'en',
      photoUrl: null,
      title: 'Private channel',
      username: null,
      description: null,
      inviteLink: null,
      defaultInviteLink: { url: 'https://t.me/+mainInvite', isRevoked: false },
      publicInviteLink: null,
      presentationIcon: null,
    });
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue(null);

    await expect(service.generate('user-1', 'channel-1', 1)).rejects.toThrow();

    expect(prisma.telegramChannel.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'channel-1', workspaceId: 'ws-1' },
        select: expect.objectContaining({
          defaultInviteLink: { select: { url: true, isRevoked: true } },
          publicInviteLink: { select: { url: true, isRevoked: true } },
        }),
      }),
    );
    expect(gateway.execute).not.toHaveBeenCalled();
  });

  it('bounds planning context while retaining channel rules and source context', () => {
    const bulky = 'Текст'.repeat(12000);
    const prompt = telegramAiPostingPlanPrompt(
      {
        channelDescription: 'Business',
        rules: [{ active: true, text: 'Use examples' }],
        learningBlock: bulky,
      },
      {
        editorialProfile: { language: 'Ukrainian', description: bulky },
        sourceContexts: [{ text: bulky }],
        existingPosts: [{ title: bulky }],
        history: [],
      } as never,
      bulky,
      1,
      [{ topic: bulky, title: bulky, text: bulky }],
    );
    expect(prompt.length).toBeLessThan(18000);
    expect(prompt).toContain('Use examples');
    expect(prompt).toContain('SOURCES');
  });

  it('parses a JSON object surrounded by model commentary', () => {
    expect(
      parseTelegramAiPostingJson(
        'Result:\n{"approved":true,"reasons":[]}\nDone.',
      ),
    ).toEqual({ approved: true, reasons: [] });
  });

  it('parses a JSON object returned as an encoded JSON string', () => {
    expect(
      parseTelegramAiPostingJson(
        JSON.stringify(
          JSON.stringify({ title: 'A topic', text: 'A useful post' }),
        ),
      ),
    ).toEqual({ title: 'A topic', text: 'A useful post' });
  });

  it('recovers a reader-facing draft when optional fields or the title are missing', () => {
    expect(
      parseTelegramAiPostingDraft(
        '{"content":"**A useful post**","format":[]}',
      ),
    ).toEqual({
      content: '**A useful post**',
      format: [],
      title: 'A useful post',
      text: '**A useful post**',
    });
  });

  it('uses a plain text model reply as the draft body when JSON formatting is ignored', () => {
    expect(
      parseTelegramAiPostingDraft('A useful post about the topic.'),
    ).toMatchObject({
      title: 'A useful post about the topic.',
      text: 'A useful post about the topic.',
    });
  });

  it('renders the configured ending exactly once', () => {
    expect(
      renderTelegramAiPostingText('Post body.\n\n😶‍🌫️ Channel Name', {
        ending: '[😶‍🌫️ Channel Name](https://t.me/example)',
      }),
    ).toBe('Post body.\n\n[😶‍🌫️ Channel Name](https://t.me/example)');
  });

  it('converts model bold markdown into editor markup without retrying on HTML', () => {
    expect(renderTelegramAiPostingText('**Emphasis** and _thought_', {})).toBe(
      '**Emphasis** and __thought__',
    );
  });

  it('retains individual topic failures and review explanations when no drafts survive', () => {
    const error = new BadGatewayException({
      code: 'AI_POSTING_NO_DRAFTS_CREATED',
      failures: [
        {
          topic: 'A topic',
          code: 'AI_POSTING_REVIEW_REJECTED',
          reasons: ['The required ending is missing.'],
        },
      ],
    });

    expect(telegramAiPostingGenerationFailures(error)).toEqual([
      {
        topic: 'A topic',
        code: 'AI_POSTING_REVIEW_REJECTED',
        reasons: ['The required ending is missing.'],
      },
    ]);
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
      sourceDiagnostics: [
        {
          sourceId: 'site-1',
          sourceType: 'website',
          displayValue: 'example.test',
          status: 'COLLECTED',
        },
      ],
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
          publications: expect.objectContaining({
            items: [],
            sourceDiagnostics: [
              expect.objectContaining({
                sourceId: 'site-1',
                status: 'COLLECTED',
              }),
            ],
          }),
          planningCost: expect.anything(),
          operations: expect.arrayContaining([
            expect.objectContaining({ status: 'FAILED', actualCost: '0.025' }),
          ]),
        }),
      }),
    );
  });

  it('rejects stale image regeneration versions before writing or calling AI', async () => {
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
        'regenerate-image',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.telegramAiPostingTestRun.updateMany).not.toHaveBeenCalled();
    expect(images.resolve).not.toHaveBeenCalled();
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
      configuration: {
        channelDescription: 'A technology channel',
        style: 'Warm and concise',
        ending: 'Test ! ![👤](tg://emoji?id=6030537299408725010)',
        emojiPolicy: 'contextual',
        hashtags: 'end',
        historyMode: 'none',
        rules: [
          {
            id: 'rule-1',
            text: 'Use practical examples',
            source: 'feedback',
            active: true,
            createdAt: '2026-11-11T00:00:00.000Z',
          },
        ],
        imageMode: 'found',
        mediaPreferences: [
          {
            id: 'photo',
            name: 'Minimalist photography',
            emoji: '📷',
            description: '',
            references: [],
            purpose: 'BOTH',
          },
          {
            id: 'drawn',
            name: 'Drawn abstraction',
            emoji: '🎨',
            description: '',
            references: [],
            purpose: 'BOTH',
          },
        ],
        formats: ['Known group'],
        categories: ['Known hypothesis'],
        allowCreateGroups: false,
        allowCreateHypotheses: false,
      },
      configurationVersion: 7,
    });
    sources.collect.mockResolvedValue({
      editorialProfile: { language: 'English' },
      sourceContexts: [
        '[website site-1] source: https://example.test/article Verified company fact',
      ],
      existingPosts: [],
      history: [],
      imageCandidates: [],
      sourceRefs: [],
      sourceDiagnostics: [
        {
          sourceId: 'site-1',
          sourceType: 'website',
          displayValue: 'example.test',
          status: 'COLLECTED',
        },
      ],
    });
    planningContext.read.mockResolvedValue({ schedule: null, hypotheses: [] });
    const replies = [
      '{"topics":["A distinct editorial topic"]}',
      '{"title":"A clear title","text":"**A useful** post","imagePrompt":"Editorial image","imageSearchQuery":"abstract mind","imageStyleIndex":1,"format":"Unlisted group","category":"Unlisted hypothesis"}',
      '{"approved":true,"reasons":[]}',
    ];
    gateway.execute.mockImplementation((request: { category: string }) => ({
      operation: {
        operationId: `op-${gateway.execute.mock.calls.length}`,
        category: request.category,
        model: 'test-model',
        status: 'UNKNOWN',
        errorCategory: 'USAGE_MISSING',
        actualCost: null,
        pricingStatus: 'UNKNOWN',
        inputTokens: 10,
        outputTokens: 10,
      },
      result: { reply: replies.shift() },
    }));
    images.resolve.mockImplementation(async () => {
      expect(prisma.telegramAiPostingTestRun.updateMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            publications: expect.objectContaining({
              progress: expect.objectContaining({
                stage: 'image',
                stages: {
                  '0:planning': 'COMPLETED',
                  '0:text': 'COMPLETED',
                  '0:review': 'COMPLETED',
                  '0:image': 'RUNNING',
                },
              }),
            }),
          }),
        }),
      );
      return { image: { url: 'https://media.example/ready.jpg', sourceId: 'source-1' }, readiness: 'READY' };
    });
    prisma.telegramChannel.findFirst.mockResolvedValue({ language: '' });
    prisma.telegramPost.findMany.mockResolvedValue([
      {
        text: 'Український бізнес зростає: підприємці обирають корисні рішення.',
        formattedText: null,
      },
    ]);

    const onProgress = jest.fn();
    const result = await service.generate(
      'user-1',
      'channel-1',
      1,
      'MANUAL',
      undefined,
      onProgress,
    );

    expect(images.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Editorial image. Visual preference: Drawn abstraction',
        searchQuery: 'abstract mind',
      }),
    );

    expect(sources.collect).toHaveBeenCalledWith(
      expect.objectContaining({ imageSelectionKey: 'run-1' }),
    );
    expect(result.generated).toHaveLength(1);
    expect(gateway.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'TELEGRAM_POSTING_TEXT',
        input: expect.stringContaining('exclusively in Ukrainian (Українська)'),
      }),
    );
    expect(prisma.telegramPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ telegramChannelId: 'channel-1' }),
        take: 30,
      }),
    );
    expect(gateway.execute.mock.calls[0][0].input).toContain(
      'topics in Ukrainian (Українська)',
    );
    expect(gateway.execute.mock.calls[2][0].input).toContain(
      'Required reader-facing language: Ukrainian (Українська)',
    );
    expect(onProgress).toHaveBeenCalledWith(
      { stage: 'planning', status: 'RUNNING', runId: 'run-1', attempt: 1 },
      0,
      9,
    );
    expect(onProgress).toHaveBeenCalledWith(
      { stage: 'text', status: 'RUNNING', runId: 'run-1', publicationIndex: 0, attempt: 1 },
      1,
      9,
    );
    expect(
      onProgress.mock.calls.map(([item]) => `${item.stage}:${item.status}`),
    ).toEqual([
      'planning:RUNNING',
      'planning:COMPLETED',
      'text:RUNNING',
      'text:COMPLETED',
      'review:RUNNING',
      'review:COMPLETED',
      'image:RUNNING',
      'image:COMPLETED',
      'publication:COMPLETED',
    ]);
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'publication',
        status: 'COMPLETED',
        runId: 'run-1',
        publicationIndex: 0,
        publication: expect.objectContaining({
          title: 'A clear title',
          imageUrl: 'https://media.example/ready.jpg',
        }),
      }),
      4,
      9,
    );
    expect(result.generated[0]).toMatchObject({
      status: 'PENDING',
      title: 'A clear title',
      text: '💡 **A useful** post\n\nTest ! ![👤](tg://emoji?id=6030537299408725010)',
      format: 'standard',
      category: 'general',
      imageUrl: 'https://media.example/ready.jpg',
      mediaReadiness: 'READY',
      costs: { planning: null, text: null, image: '0', review: null },
    });
    expect(gateway.execute.mock.calls[2][0].input).toContain(
      'Proposed authored post text (without configured ending or hashtags): **A useful** post',
    );
    expect(gateway.execute.mock.calls[1][0].input).toContain(
      'Verified company fact',
    );
    expect(gateway.execute.mock.calls[2][0].input).toContain(
      'Verified company fact',
    );
    expect(gateway.execute.mock.calls[2][0].input).not.toContain('Test !');
    expect(result.generated[0].text).toContain(
      'Test ! ![👤](tg://emoji?id=6030537299408725010)',
    );
    expect(gateway.execute.mock.calls[2][0].input).not.toContain('<b>');
    for (const prompt of [
      gateway.execute.mock.calls[0][0].input,
      gateway.execute.mock.calls[1][0].input,
      gateway.execute.mock.calls[2][0].input,
    ]) {
      expect(prompt).toContain('ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА КАНАЛА');
      expect(prompt).toContain('1. Use practical examples');
    }
    expect(gateway.execute.mock.calls[0][0].input).toContain(
      'Описание канала: A technology channel',
    );
    expect(gateway.execute.mock.calls[0][0].input).toContain(
      'Стиль: Warm and concise',
    );
    expect(gateway.execute.mock.calls[1][0].input).toContain(
      'Add 1–3 relevant hashtags.',
    );
    expect(gateway.execute.mock.calls[1][0].input).toContain(
      'Start the post body with exactly one relevant emoji that conveys the topic.',
    );
    expect(gateway.execute).toHaveBeenCalledTimes(3);
    expect(gateway.execute.mock.calls[0][0].aiPosting).toMatchObject({
      channelId: 'channel-1',
      testRunId: 'run-1',
      postingMode: 'TEST',
      dailyBudget: null,
    });
    expect(prisma.telegramAiPostingTestRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run-1' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          publications: expect.objectContaining({
            items: expect.any(Array),
            sourceDiagnostics: [
              expect.objectContaining({
                sourceId: 'site-1',
                status: 'COLLECTED',
              }),
            ],
          }),
        }),
      }),
    );
    expect(result.sourceDiagnostics).toEqual([
      expect.objectContaining({ sourceId: 'site-1', status: 'COLLECTED' }),
    ]);
    expect(posts.createManagedPostRecord).not.toHaveBeenCalled();
    expect(posts.prepareManagedPostCreate).not.toHaveBeenCalled();
  });

  it('keeps image-ready captions when usage is unavailable and applies Telegram-safe length and emoji rules', async () => {
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue({
      configuration: {
        imageMode: 'ai',
        mediaPreferences: [
          {
            id: 'reference-style',
            name: 'Reference style',
            emoji: '🎨',
            description: '',
            references: ['https://media.example/reference.jpg'],
            purpose: 'GENERATION',
          },
        ],
        useChannelAvatarInMedia: true,
        emojiPolicy: 'start',
        hashtags: 'disabled',
        formats: [],
        categories: [],
      },
      configurationVersion: 1,
      aiDailyBudget: null,
      aiMonthlyBudget: null,
    });
    prisma.telegramChannel.findFirst.mockResolvedValue({
      language: '',
      photoUrl: 'https://media.example/avatar.jpg',
    });
    images.prepareReferenceSheet.mockResolvedValue({
      image: Buffer.from('reference-sheet'),
      failed: false,
    });
    images.prepareChannelAvatar.mockResolvedValue(
      Buffer.from('channel-avatar'),
    );
    sources.collect.mockResolvedValue({
      editorialProfile: { language: 'English' },
      sourceContexts: [],
      existingPosts: [],
      history: [],
      imageCandidates: [],
      sourceRefs: [],
      sourceDiagnostics: [],
    });
    planningContext.read.mockResolvedValue({ schedule: null, hypotheses: [] });
    gateway.execute.mockImplementation((request: { category: string; aiPosting: { publicationIndex: number } }) => ({
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
      result: {
        reply: request.category === 'TELEGRAM_POSTING_PLAN'
          ? '{"topics":["Distinct topic about emotions","Distinct topic about habits","Distinct topic about boundaries"]}'
          : request.category === 'TELEGRAM_POSTING_REVIEW'
            ? '{"approved":true,"reasons":[]}'
            : JSON.stringify({
              title: `A short title ${request.aiPosting.publicationIndex}`,
              text: `A useful and concise post about topic ${request.aiPosting.publicationIndex}.`,
              ...(request.aiPosting.publicationIndex === 1 ? {} : { imagePrompt: 'Editorial illustration' }),
            }),
      },
    }));
    images.resolve.mockResolvedValue({
      image: {
        url: 'https://media.example/generated.jpg',
        sourceId: 'openai-image-generation',
      },
      readiness: 'READY',
    });

    const result = await service.generate('user-1', 'channel-1', 3);

    const textRequest = gateway.execute.mock.calls.find(
      ([request]) => request.category === 'TELEGRAM_POSTING_TEXT',
    )?.[0];
    expect(textRequest?.input).toContain('Do not add hashtags.');
    expect(textRequest?.input).not.toContain('Include 1–3 relevant hashtags');

    expect(result.generated).toHaveLength(3);
    expect(
      result.generated.every((item) => item.mediaReadiness === 'READY'),
    ).toBe(true);
    expect(result.generated.every((item) => item.text.length <= 900)).toBe(
      true,
    );
    expect(result.failures).toEqual([]);
    expect(images.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Distinct topic about habits'),
        referenceImage: Buffer.from('reference-sheet'),
        channelAvatar: Buffer.from('channel-avatar'),
        watermarkChannelAvatar: true,
      }),
    );
    expect(textRequest?.input).toContain(
      'exactly one relevant emoji at the very beginning',
    );
    expect(textRequest?.input).toContain('under 900 visible characters');
  });

  it('retries malformed draft JSON with a clear correction instruction', async () => {
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue({
      configuration: { imageMode: 'ai', formats: [], categories: [] },
      configurationVersion: 1,
      aiDailyBudget: null,
      aiMonthlyBudget: null,
    });
    sources.collect.mockResolvedValue({
      editorialProfile: { language: 'English' },
      sourceContexts: [],
      existingPosts: [],
      history: [],
      imageCandidates: [],
      sourceRefs: [],
      sourceDiagnostics: [],
    });
    planningContext.read.mockResolvedValue({ schedule: null, hypotheses: [] });
    const replies = [
      '{"topics":["A distinct editorial topic"]}',
      '{}',
      { title: 'A title', text: 'A short caption with "quotes".', imagePrompt: 'Editorial illustration', imageSearchQuery: 'illustration', imageStyleIndex: 0 },
      '{"approved":true,"reasons":[]}',
    ];
    gateway.execute.mockImplementation((request: { category: string }) => {
      const body = replies.shift();
      return ({
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
      result: typeof body === 'string' ? { reply: body } : body,
      });
    });
    images.resolve.mockResolvedValue({
      image: {
        url: 'https://media.example/generated.jpg',
        sourceId: 'openai-image-generation',
      },
      readiness: 'READY',
    });

    const result = await service.generate('user-1', 'channel-1', 1);

    expect(result.generated).toHaveLength(1);
    expect(result.generated[0].mediaReadiness).toBe('READY');
    const textRequests = gateway.execute.mock.calls.filter(
      ([request]) => request.category === 'TELEGRAM_POSTING_TEXT',
    );
    expect(textRequests).toHaveLength(2);
    expect(textRequests.every(([request]) => request.postingDraft === true)).toBe(true);
    expect(textRequests[1][0].input).toContain('Revise the previous draft');
  });

  it('retries malformed review JSON instead of dropping the publication', async () => {
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue({
      configuration: { imageMode: 'ai', formats: [], categories: [] },
      configurationVersion: 1,
      aiDailyBudget: null,
      aiMonthlyBudget: null,
    });
    sources.collect.mockResolvedValue({
      editorialProfile: { language: 'English' },
      sourceContexts: [],
      existingPosts: [],
      history: [],
      imageCandidates: [],
      sourceRefs: [],
      sourceDiagnostics: [],
    });
    planningContext.read.mockResolvedValue({ schedule: null, hypotheses: [] });
    const replies = [
      '{"topics":["A distinct editorial topic"]}',
      '{"title":"A title","text":"A short caption","imagePrompt":"Editorial illustration","imageSearchQuery":"illustration","imageStyleIndex":0,"format":"standard","category":"general"}',
      'not valid json',
      '{"approved":true,"reasons":[]}',
    ];
    gateway.execute.mockImplementation((request: { category: string }) => ({
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
    }));
    images.resolve.mockResolvedValue({
      image: {
        url: 'https://media.example/generated.jpg',
        sourceId: 'openai-image-generation',
      },
      readiness: 'READY',
    });

    const result = await service.generate('user-1', 'channel-1', 1);

    expect(result.generated).toHaveLength(1);
    expect(result.generated[0].title).toBe('A title');
    expect(result.generated[0].mediaReadiness).toBe('READY');
    const calls = gateway.execute.mock.calls.map(([call]) => call);
    expect(calls.filter((call) => call.category === 'TELEGRAM_POSTING_TEXT')).toHaveLength(1);
    const checks = calls.filter((call) => call.category === 'TELEGRAM_POSTING_REVIEW');
    expect(checks).toHaveLength(2);
    expect(checks.every((call) => call.postingReview && call.input.includes('A short caption'))).toBe(true);
  });

  it('preserves generated text and records a failed image operation and its cost', async () => {
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue({
      configuration: { imageMode: 'ai', formats: [], categories: [] },
      configurationVersion: 3,
      aiDailyBudget: null,
      aiMonthlyBudget: null,
    });
    sources.collect.mockResolvedValue({
      editorialProfile: { language: 'English' },
      sourceContexts: [],
      existingPosts: [],
      history: [],
      imageCandidates: [],
      sourceRefs: [],
      sourceDiagnostics: [],
    });
    planningContext.read.mockResolvedValue({ schedule: null, hypotheses: [] });
    const replies = [
      '{"topics":["A distinct editorial topic"]}',
      '{"title":"A clear title","text":"A useful post","imagePrompt":"Editorial image"}',
      '{"approved":true,"reasons":[]}',
    ];
    gateway.execute.mockImplementation((request: { category: string }) => ({
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
    }));
    const imageOperation = {
      stage: 'image',
      attempt: 1,
      operationId: 'image-op-1',
      category: 'TELEGRAM_POSTING_IMAGE',
      model: 'image-model',
      status: 'FAILED',
      actualCost: '0.025',
      pricingStatus: 'PRICED',
      inputTokens: null,
      outputTokens: null,
    };
    images.resolve.mockResolvedValue({
      image: null,
      readiness: 'FAILED',
      failureCode: 'AI_POSTING_IMAGE_PROVIDER_FAILED',
      operation: imageOperation,
    });

    const onProgress = jest.fn();
    const result = await service.generate('user-1', 'channel-1', 1, 'MANUAL', undefined, onProgress);
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'publication', status: 'FAILED', publicationIndex: 0 }),
      expect.any(Number),
      expect.any(Number),
    );

    const publication = result.generated[0];
    expect(publication.title).toBe('A clear title');
    expect(publication.text).toBe('💡 A useful post');
    expect(publication.imageUrl).toBeNull();
    expect(publication.mediaReadiness).toBe('FAILED');
    expect(publication.mediaFailureCode).toBe(
      'AI_POSTING_IMAGE_PROVIDER_FAILED',
    );
    expect(publication.costs.image).toBe('0.025');
    expect(
      publication.operations.some(
        (entry) => entry.operationId === 'image-op-1',
      ),
    ).toBe(true);
    expect(result.failures.map((failure) => failure.code)).toContain(
      'AI_POSTING_IMAGE_PROVIDER_FAILED',
    );
    const updateCalls = prisma.telegramAiPostingTestRun.update.mock
      .calls as unknown as Array<
      [{ data: { status: string; imageCost: unknown } }]
    >;
    const updatedRun = updateCalls[0]?.[0];
    expect(updatedRun.data.status).toBe('PARTIAL');
    expect(updatedRun.data.imageCost).not.toBeUndefined();
  });

  it('keeps image cost unknown when the gateway call has no settled operation', async () => {
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue({
      configuration: { imageMode: 'ai', formats: [], categories: [] },
      configurationVersion: 3,
      aiDailyBudget: null,
      aiMonthlyBudget: null,
    });
    sources.collect.mockResolvedValue({
      editorialProfile: { language: 'English' },
      sourceContexts: [],
      existingPosts: [],
      history: [],
      imageCandidates: [],
      sourceRefs: [],
      sourceDiagnostics: [],
    });
    planningContext.read.mockResolvedValue({ schedule: null, hypotheses: [] });
    const replies = [
      '{"topics":["A distinct editorial topic"]}',
      '{"title":"A clear title","text":"A useful post","imagePrompt":"Editorial image"}',
      '{"approved":true,"reasons":[]}',
    ];
    gateway.execute.mockImplementation((request: { category: string }) => ({
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
    }));
    images.resolve.mockResolvedValue({
      image: null,
      readiness: 'FAILED',
      failureCode: 'AI_POSTING_IMAGE_PROVIDER_FAILED',
      costUnknown: true,
    });

    const result = await service.generate('user-1', 'channel-1', 1);

    expect(result.generated[0].costs.image).toBeNull();
    expect(result.generated[0].imageCostUnknown).toBe(true);
    const updateCalls = prisma.telegramAiPostingTestRun.update.mock
      .calls as unknown as Array<
      [{ data: { imageCost: string | null; status: string } }]
    >;
    const updatedRun = updateCalls[0]?.[0];
    expect(updatedRun.data.imageCost).toBeNull();
    expect(updatedRun.data.status).toBe('PARTIAL');
  });

  it('returns diagnostics from new run data and reads historical publication arrays', async () => {
    prisma.telegramChannel.findFirst.mockResolvedValue({ id: 'channel-1' });
    prisma.telegramAiPostingTestRun.findMany.mockResolvedValue([
      {
        id: 'legacy-run',
        publications: [{ topic: 'Old preview' }],
        status: 'COMPLETED',
      },
      {
        id: 'new-run',
        publications: {
          items: [{ topic: 'New preview' }],
          sourceDiagnostics: [
            {
              sourceId: 'source-1',
              sourceType: 'rss',
              displayValue: 'feed.example',
              status: 'UNAVAILABLE',
              reason: 'SOURCE_FETCH_FAILED',
            },
          ],
        },
        status: 'PARTIAL',
      },
    ]);

    const runs = await testRuns.listRuns('user-1', 'channel-1');

    expect(runs).toHaveLength(2);
    expect(runs[0].publications).toEqual([{ topic: 'Old preview', text: '' }]);
    expect(runs[0].sourceDiagnostics).toBeUndefined();
    expect(runs[1].publications).toEqual([{ topic: 'New preview', text: '' }]);
    expect(runs[1].sourceDiagnostics).toEqual([
      expect.objectContaining({ status: 'UNAVAILABLE' }),
    ]);
    // The endpoint intentionally exposes only the latest review batch.
    expect(prisma.telegramAiPostingTestRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20 }),
    );
  });

  it('reads the persisted stage in the selected channel and stops tracking stale runs', async () => {
    const progress = {
      count: 4, current: 5, total: 33, complete: 1, failed: false,
      publicationIndex: 1, stage: 'text', stages: { '1:text': 'RUNNING' },
    };
    const row = {
      status: 'RUNNING', updatedAt: new Date(), requestedCount: 4,
      publications: { items: [], progress },
    };
    prisma.telegramAiPostingTestRun.findFirst
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce({
        ...row,
        updatedAt: new Date(Date.now() - 5 * 60_000),
        publications: { ...row.publications, background: true },
      })
      .mockResolvedValueOnce({ ...row, updatedAt: new Date(Date.now() - 31 * 60_000) })
      .mockResolvedValueOnce(null);

    await expect(testRuns.readRunProgress('user-1', 'channel-1', 'run-1'))
      .resolves.toEqual({ status: 'RUNNING', progress, updatedAt: row.updatedAt.toISOString() });
    expect(prisma.telegramAiPostingTestRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'run-1', workspaceId: 'ws-1', telegramChannelId: 'channel-1' } }),
    );
    await expect(testRuns.readRunProgress('user-1', 'channel-1', 'run-1'))
      .resolves.toEqual({ status: 'INTERRUPTED' });
    await expect(testRuns.readRunProgress('user-1', 'channel-1', 'run-1'))
      .resolves.toEqual({ status: 'INTERRUPTED' });
    await expect(testRuns.readRunProgress('user-1', 'other-channel', 'run-1'))
      .rejects.toThrow('AI Posting test run not found');
  });

  it('regenerates only the selected publication image and preserves its text and siblings', async () => {
    const selected = {
      topic: 'Selected topic',
      title: 'Selected title',
      text: 'Selected text',
      imagePrompt: 'Editorial image',
      imageUrl: null,
      imageSourceId: null,
      mediaReadiness: 'MISSING',
      format: 'standard',
      category: 'general',
      reviewNotes: [],
      costs: { planning: '0.01', text: '0.02', image: '0', review: '0.01' },
      operations: [],
      ideaSources: [],
      status: 'PENDING',
      rejectionReason: null,
      savedPostId: null,
    };
    const sibling = {
      ...selected,
      topic: 'Sibling topic',
      title: 'Sibling title',
    };
    const persistedRun = {
      id: 'run-image',
      workspaceId: 'ws-1',
      telegramChannelId: 'channel-1',
      version: 1,
      settingsVersion: 2,
      status: 'PARTIAL',
      publications: { items: [selected, sibling], sourceDiagnostics: [] },
      operations: [],
      feedback: [],
    };
    prisma.telegramAiPostingTestRun.findFirst.mockResolvedValue(persistedRun);
    prisma.telegramAiPostingTestRun.updateMany.mockResolvedValue({ count: 1 });
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue({
      configuration: { imageMode: 'found' },
      aiDailyBudget: null,
      aiMonthlyBudget: null,
    });
    const imageOperation = {
      stage: 'image',
      attempt: 1,
      operationId: 'image-op-1',
      category: 'TELEGRAM_POSTING_IMAGE',
      model: 'image-model',
      status: 'SUCCEEDED',
      actualCost: '0.025',
      pricingStatus: 'PRICED',
      inputTokens: null,
      outputTokens: null,
    };
    images.resolve.mockResolvedValue({
      image: {
        url: 'https://media.example/selected.jpg',
        sourceId: 'ai-generated',
      },
      readiness: 'READY',
      operation: imageOperation,
    });

    const result = await testRuns.reviewPublication(
      'user-1',
      'channel-1',
      'run-image',
      0,
      1,
      'regenerate-image',
    );

    const publications = result.publications as unknown as Array<{
      title: string;
      text: string;
      imageUrl: string | null;
      mediaReadiness: string;
      operations: Array<{ operationId: string }>;
    }>;
    expect(publications[0].title).toBe('Selected title');
    expect(publications[0].text).toBe('Selected text');
    expect(publications[0].imageUrl).toBe('https://media.example/selected.jpg');
    expect(publications[0].mediaReadiness).toBe('READY');
    expect(publications[1].title).toBe('Sibling title');
    expect(publications[1].imageUrl).toBeNull();
    expect(
      publications[0].operations.some(
        (entry) => entry.operationId === 'image-op-1',
      ),
    ).toBe(true);
    expect(images.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ imageMode: 'found', fallbackToGeneration: true }),
    );
    const imageUpdateCalls = prisma.telegramAiPostingTestRun.updateMany.mock
      .calls as unknown as Array<
      [
        {
          where: { id: string; workspaceId: string; version: number };
          data: { version: { increment: number } };
        },
      ]
    >;
    const imageUpdate = imageUpdateCalls[0]?.[0];
    expect(imageUpdate.where).toEqual({
      id: 'run-image',
      workspaceId: 'ws-1',
      version: 1,
    });
    expect(imageUpdate.data.version.increment).toBe(1);
  });

  it('persists failed regeneration readiness, cost, and Task 04 diagnostics', async () => {
    const publication = {
      topic: 'Topic',
      title: 'Title',
      text: 'Text remains available',
      imagePrompt: 'Image',
      imageUrl: null,
      imageSourceId: null,
      mediaReadiness: 'MISSING',
      format: 'standard',
      category: 'general',
      reviewNotes: [],
      costs: { image: '0' },
      operations: [],
      ideaSources: [],
      status: 'PENDING',
      rejectionReason: null,
      savedPostId: null,
    };
    const sourceDiagnostics = [
      {
        sourceId: 'rss-1',
        sourceType: 'rss',
        displayValue: 'feed.example',
        status: 'COLLECTED',
      },
    ];
    prisma.telegramAiPostingTestRun.findFirst.mockResolvedValue({
      id: 'run-regeneration-failed',
      workspaceId: 'ws-1',
      telegramChannelId: 'channel-1',
      version: 4,
      publications: { items: [publication], sourceDiagnostics },
      operations: [],
      feedback: [],
    });
    prisma.telegramAiPostingTestRun.updateMany.mockResolvedValue({ count: 1 });
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue({
      configuration: {},
      aiDailyBudget: null,
      aiMonthlyBudget: null,
    });
    images.resolve.mockResolvedValue({
      image: null,
      readiness: 'FAILED',
      failureCode: 'AI_POSTING_IMAGE_STORAGE_FAILED',
      operation: {
        stage: 'image',
        attempt: 1,
        operationId: 'image-op-failed',
        category: 'TELEGRAM_POSTING_IMAGE',
        model: 'image-model',
        status: 'SUCCEEDED',
        actualCost: '0.04',
        pricingStatus: 'PRICED',
        inputTokens: null,
        outputTokens: null,
      },
    });

    await expect(
      testRuns.reviewPublication(
        'user-1',
        'channel-1',
        'run-regeneration-failed',
        0,
        4,
        'regenerate-image',
      ),
    ).rejects.toBeInstanceOf(BadGatewayException);

    type FailedUpdateCall = {
      where: { id: string; workspaceId: string; version: number };
      data: {
        imageCost: unknown;
        publications: {
          sourceDiagnostics: unknown[];
          items: Array<{
            text: string;
            mediaReadiness: string;
            mediaFailureCode: string;
            costs: { image: string | null };
          }>;
        };
      };
    };
    const failedUpdateCalls = prisma.telegramAiPostingTestRun.updateMany.mock
      .calls as unknown as Array<[FailedUpdateCall]>;
    const failedUpdate = failedUpdateCalls[0]?.[0];
    expect(failedUpdate.where).toEqual({
      id: 'run-regeneration-failed',
      workspaceId: 'ws-1',
      version: 4,
    });
    expect(failedUpdate.data.imageCost).not.toBeUndefined();
    expect(failedUpdate.data.publications.sourceDiagnostics).toEqual(
      sourceDiagnostics,
    );
    expect(failedUpdate.data.publications.items[0]).toMatchObject({
      text: 'Text remains available',
      mediaReadiness: 'FAILED',
      mediaFailureCode: 'AI_POSTING_IMAGE_STORAGE_FAILED',
      costs: { image: '0.04' },
    });
  });

  it('rejects image regeneration when the text exceeds Telegram caption length', async () => {
    prisma.telegramAiPostingTestRun.findFirst.mockResolvedValue({
      id: 'run-long',
      workspaceId: 'ws-1',
      telegramChannelId: 'channel-1',
      version: 1,
      publications: [
        {
          topic: 'Topic',
          title: 'Title',
          text: 'x'.repeat(1025),
          imagePrompt: 'Image',
          imageUrl: null,
          imageSourceId: null,
          format: 'standard',
          category: 'general',
          reviewNotes: [],
          costs: { image: '0' },
          operations: [],
          ideaSources: [],
          status: 'PENDING',
          rejectionReason: null,
          savedPostId: null,
        },
      ],
      operations: [],
      feedback: [],
    });
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue({
      configuration: {},
      aiDailyBudget: null,
      aiMonthlyBudget: null,
    });

    await expect(
      testRuns.reviewPublication(
        'user-1',
        'channel-1',
        'run-long',
        0,
        1,
        'regenerate-image',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(images.resolve).not.toHaveBeenCalled();
  });

  it('edits a three-post preview and saves one publication with its AI ledger link', async () => {
    const publication = {
      topic: 'A distinct topic for the channel',
      title: 'Original title',
      text: 'Original text',
      imagePrompt: 'Editorial image',
      imageUrl: 'https://media.example/approved.jpg',
      imageSourceId: null,
      format: 'standard',
      category: 'general',
      reviewNotes: [],
      costs: { planning: '0.03', text: '0.04', image: '0', review: '0.01' },
      operations: [],
      ideaSources: [
        { id: 'source-1', type: 'rss', value: 'https://example.test/feed' },
      ],
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
      publications: [
        publication,
        { ...publication, topic: 'Second distinct topic' },
        { ...publication, topic: 'Third distinct topic' },
      ],
      operations: [{ operationId: 'op-1', stage: 'text', actualCost: '0.04' }],
      feedback: [],
    };
    prisma.telegramAiPostingTestRun.findFirst.mockImplementation(
      async () => persistedRun,
    );
    prisma.telegramAiPostingTestRun.updateMany.mockImplementation(
      async ({ where, data }: any) => {
        if (where.version !== persistedRun.version) return { count: 0 };
        const { version, ...rest } = data;
        Object.assign(persistedRun, rest);
        if (version?.increment) persistedRun.version += version.increment;
        return { count: 1 };
      },
    );
    posts.prepareManagedPostCreate.mockResolvedValue({ prepared: true });
    posts.createManagedPostRecord.mockResolvedValue({ id: 'managed-post-1' });
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      telegramAiPostingTestRun: {
        updateMany: jest.fn(async ({ where, data }: any) => {
          if (where.version !== persistedRun.version) return { count: 0 };
          if (data.version?.increment)
            persistedRun.version += data.version.increment;
          return { count: 1 };
        }),
      },
      telegramAiPostingGeneration: { create: jest.fn() },
      aiOperation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    (prisma as any).$transaction = jest.fn((callback: any) => callback(tx));

    const edited = await testRuns.reviewPublication(
      'user-1',
      'channel-1',
      'test-run-1',
      0,
      1,
      'edit',
      'Revised post text',
    );
    expect(edited.version).toBe(2);
    expect(edited.publications?.[0].text).toBe('Revised post text');
    expect(edited.publications?.[0].ideaSources).toEqual(
      publication.ideaSources,
    );

    const approved = await testRuns.reviewPublication(
      'user-1',
      'channel-1',
      'test-run-1',
      0,
      2,
      'approve',
    );
    expect(approved.publications?.[0].status).toBe('APPROVED');

    const saved = await testRuns.reviewPublication(
      'user-1',
      'channel-1',
      'test-run-1',
      0,
      3,
      'save',
    );
    expect(saved.publications?.[0]).toMatchObject({
      status: 'SAVED_DRAFT',
      savedPostId: 'managed-post-1',
    });
    expect(persistedRun.publications.items[0].text).toBe('Revised post text');
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

  it('keeps search slots within the fallback limit while generating both a quote and a long illustrated post', async () => {
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue({
      configuration: {
        language: 'en', imageMode: 'hybrid', hybridSearchPercent: 80,
        lengths: [
          { id: 'quote', name: 'Quote', minCharacters: 0, maxCharacters: 99 },
          { id: 'long', name: 'Long', minCharacters: 1200, maxCharacters: 1800 },
          { id: 'short', name: 'Short', minCharacters: 100, maxCharacters: 299 },
          { id: 'medium', name: 'Medium', minCharacters: 300, maxCharacters: 699 },
        ],
        rubrics: [
          { id: 'quotes', name: 'Daily quote', lengthIds: ['quote'] },
          { id: 'general', name: 'Reflection', lengthIds: [] },
        ],
      },
      configurationVersion: 1,
    });
    sources.collect.mockResolvedValue({
      editorialProfile: { language: 'English' }, sourceContexts: [],
      existingPosts: [], history: [], imageCandidates: [], sourceRefs: [],
    });
    planningContext.read.mockResolvedValue({ schedule: null, hypotheses: [] });
    images.resolve.mockImplementation(async ({ imageMode, fallbackToGeneration, claimGenerationFallback, aiPosting }) =>
      aiPosting.publicationIndex === 1
        ? { image: { url: 'https://media.example/photo.jpg', sourceId: 'wikimedia-commons' }, readiness: 'READY' }
        : imageMode === 'ai' || (fallbackToGeneration && claimGenerationFallback())
        ? { image: { url: 'https://media.example/generated.jpg', sourceId: 'openai-image-generation' }, readiness: 'READY' }
        : { image: null, readiness: 'MISSING', failureCode: 'AI_POSTING_IMAGE_SEARCH_SHARE_LIMIT' },
    );
    const draftTexts = [
      'Rest is allowed even before everything is finished.',
      'Start with a concrete situation and explain the decision. '.repeat(25),
      'Choose one small action and give yourself time to try it. '.repeat(3),
      'A useful thought starts with a situation that readers can recognize. '.repeat(6),
    ];
    gateway.execute.mockImplementation(({ category, aiPosting }) => ({
      operation: { category, model: 'test', status: 'SUCCEEDED', actualCost: '0.01', pricingStatus: 'PRICED' },
      result: { reply: category === 'TELEGRAM_POSTING_PLAN'
        ? JSON.stringify({ topics: ['Rest after a demanding day', 'How to make a complex decision', 'Time for a small action', 'Starting from a familiar situation'] })
        : category === 'TELEGRAM_POSTING_REVIEW'
          ? '{"approved":true,"reasons":[]}'
          : JSON.stringify({ title: 'Editorial article', text: draftTexts[aiPosting.publicationIndex] }) },
    }));

    const result = await service.generate('user-1', 'channel-1', 4);

    expect(result.generated.map((item) => [item.editorialMetadata?.length?.id, item.imageSourceId]))
      .toEqual([['quote', 'openai-image-generation'], ['long', 'wikimedia-commons'], ['short', 'openai-image-generation'], ['medium', null]]);
    expect(result.generated[0].editorialMetadata?.rubric?.id).toBe('quotes');
    expect(result.generated[1].text.length).toBeGreaterThan(1200);
    expect(result.failures.map(({ code }) => code)).toEqual(['AI_POSTING_IMAGE_SEARCH_SHARE_LIMIT']);
  });

  it.each([false, true])('repairs an empty text slot and accounts for planning retries (invalid initial plan: %s)', async (invalidPlan) => {
    const { telegramAiPostingTestRun } = prisma;
    telegramAiPostingTestRun.updateMany.mockResolvedValue({ count: 1 });
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue({
      configuration: { language: 'en', imageMode: 'hybrid', hybridSearchPercent: 70 },
      configurationVersion: 1,
    });
    sources.collect.mockResolvedValue({
      editorialProfile: { language: 'English' }, sourceContexts: [],
      existingPosts: [], history: [], imageCandidates: [], sourceRefs: [],
    });
    planningContext.read.mockResolvedValue({ schedule: null, hypotheses: [] });
    images.resolve.mockResolvedValue({
      image: { url: 'https://media.example/approved.jpg', sourceId: 'openverse' },
      readiness: 'READY',
    });
    let repair = false;
    let draftAttempts = 0;
    let planAttempts = 0;
    gateway.execute.mockImplementation(({ category }: { category: string }) => ({
      operation: {
        operationId: `op-${gateway.execute.mock.calls.length}`, category, model: 'test-model',
        status: 'SUCCEEDED', actualCost: '0.01', pricingStatus: 'PRICED',
      },
      result: { reply: category === 'TELEGRAM_POSTING_PLAN'
        ? (planAttempts++ === 0 && invalidPlan
          ? '{"topics":["Only one topic for two assignments"]}'
          : '{"topics":["First editorial topic",{"topic":"Second editorial topic"}]}')
        : category === 'TELEGRAM_POSTING_REVIEW'
          ? '{"approved":true,"reasons":[]}'
          : repair ? '{"title":"Recovered","text":"A newly written caption."}'
            : draftAttempts++ === 0 ? '{"title":"First","text":"A different caption."}'
              : '{"title":"Second","text":"  "}' },
    }));

    const initial = await service.generate('user-1', 'channel-1', 2);
    expect(initial.generated[0].costs.planning).toBe(invalidPlan ? '0.01' : '0.005');
    expect(initial.failures).toEqual([
      expect.objectContaining({ publicationIndex: 1, code: 'AI_POSTING_TEXT_EMPTY' }),
    ]);
    const stored = telegramAiPostingTestRun.update.mock.calls.at(-1)![0].data;
    repair = true;
    const result = await service.generate(
      'user-1', 'channel-1', 1, 'MANUAL', undefined, undefined, 'Second editorial topic',
      { id: initial.runId, version: initial.version, publicationIndex: 1,
        failureIndex: 0, requestedCount: 2, ...stored },
    );
    expect(result.failures).toEqual([]);
    expect(telegramAiPostingTestRun.create).toHaveBeenCalledTimes(1);
    expect(gateway.execute.mock.calls.filter(([request]) => request.category === 'TELEGRAM_POSTING_PLAN')).toHaveLength(invalidPlan ? 2 : 1);
    const settled = telegramAiPostingTestRun.updateMany.mock.calls.at(-1)![0].data;
    expect(settled.status).toBe('COMPLETED');
    expect(settled.publications.items).toEqual([
      expect.objectContaining({ publicationIndex: 0, title: 'First' }),
      expect.objectContaining({
        publicationIndex: 1, title: 'Recovered',
        costs: { planning: invalidPlan ? '0.01' : '0.005', text: '0.03', review: '0.01', image: '0' },
      }),
    ]);
  });

  it('uses references attached to the preference selected for that draft', async () => {
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue({
      configuration: {
        imageMode: 'hybrid',
        mediaPreferences: [
          {
            id: 'illustration',
            name: 'Рисованная схема',
            description: 'Тёплая палитра и простая композиция',
            emoji: '🖍️',
            references: ['https://media.example/illustration.jpg'],
          },
        ],
        formats: [],
        categories: [],
      },
      configurationVersion: 1,
      aiDailyBudget: null,
      aiMonthlyBudget: null,
    });
    sources.collect.mockResolvedValue({
      editorialProfile: { language: 'English' },
      sourceContexts: [],
      existingPosts: [],
      history: [],
      imageCandidates: [],
      sourceRefs: [],
      sourceDiagnostics: [],
    });
    planningContext.read.mockResolvedValue({ schedule: null, hypotheses: [] });
    images.prepareReferenceSheet.mockResolvedValue({
      image: Buffer.from('selected-preference-reference'),
      failed: false,
    });
    images.resolve.mockResolvedValue({
      image: { url: 'https://media.example/generated.jpg', sourceId: 'ai' },
      readiness: 'READY',
    });
    const replies = [
      '{"topics":["A distinct editorial topic"]}',
      '{"title":"A title","text":"A short caption","imagePrompt":"Editorial illustration","imageStyleIndex":0,"format":"standard","category":"general"}',
      '{"approved":true,"reasons":[]}',
    ];
    gateway.execute.mockImplementation((request: { category: string }) => ({
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
    }));

    const result = await service.generate('user-1', 'channel-1', 1);

    const textRequest = gateway.execute.mock.calls.find(
      ([request]) => request.category === 'TELEGRAM_POSTING_TEXT',
    )?.[0];
    expect(result.generated).toHaveLength(1);
    expect(result.generated[0].mediaPreference).toEqual({
      id: 'illustration',
      name: 'Рисованная схема',
    });
    expect(textRequest?.input).toContain('Рисованная схема');
    expect(textRequest?.input).toContain('Тёплая палитра и простая композиция');
    expect(images.prepareReferenceSheet).toHaveBeenCalledWith([
      'https://media.example/illustration.jpg',
    ]);
    expect(images.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        imageMode: 'found',
        fallbackToGeneration: true,
        referenceImage: Buffer.from('selected-preference-reference'),
      }),
    );
  });
});
