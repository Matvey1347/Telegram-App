import { BadGatewayException, ConflictException } from '@nestjs/common';
import { TelegramAiPostingGeneratorService } from './telegram-ai-posting-generator.service';
import { TelegramAiPostingTestRunService } from './telegram-ai-posting-test-run.service';
import { renderTelegramAiPostingText } from './telegram-ai-posting-render';
import { parseTelegramAiPostingDraft } from './telegram-ai-posting-json';

describe('TelegramAiPostingGeneratorService', () => {
  const workspace = {
    resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('ws-1'),
  };
  const prisma = {
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
    {} as never,
  );
  beforeEach(() => {
    jest.clearAllMocks();
    images.prepareReferenceSheet.mockResolvedValue({
      image: null,
      failed: false,
    });
    images.prepareChannelAvatar.mockResolvedValue(null);
    prisma.telegramAiPostingTestRun.findMany.mockResolvedValue([]);
  });

  it('rejects counts outside one through five before reading or calling AI', async () => {
    await expect(
      service.generate('user-1', 'channel-1', 6),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.telegramAiPostingSettings.findFirst).not.toHaveBeenCalled();
    expect(gateway.execute).not.toHaveBeenCalled();
  });

  it('parses a JSON object surrounded by model commentary', () => {
    expect(
      (service as any).parseJson(
        'Result:\n{"approved":true,"reasons":[]}\nDone.',
      ),
    ).toEqual({ approved: true, reasons: [] });
  });

  it('parses a JSON object returned as an encoded JSON string', () => {
    const parseJson = (value: string) =>
      (
        service as unknown as {
          parseJson: (input: string) => Record<string, unknown> | null;
        }
      ).parseJson(value);
    expect(
      parseJson(
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

    expect((service as any).errorFailures(error)).toEqual([
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
        imageStyles: ['Minimalist photography', 'Drawn abstraction'],
        formats: ['Known group'],
        categories: ['Known hypothesis'],
        allowCreateGroups: false,
        allowCreateHypotheses: false,
      },
      configurationVersion: 7,
    });
    sources.collect.mockResolvedValue({
      editorialProfile: { language: 'English' },
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
        status: 'SUCCEEDED',
        actualCost: null,
        pricingStatus: 'UNKNOWN',
        inputTokens: 10,
        outputTokens: 10,
      },
      result: { reply: replies.shift() },
    }));
    images.resolve.mockResolvedValue({
      image: { url: 'https://media.example/ready.jpg', sourceId: 'source-1' },
      readiness: 'READY',
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
      { stage: 'planning', status: 'RUNNING', attempt: 1 },
      0,
      9,
    );
    expect(onProgress).toHaveBeenCalledWith(
      { stage: 'text', status: 'RUNNING', publicationIndex: 0, attempt: 1 },
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
    ]);
    expect(result.generated[0]).toMatchObject({
      status: 'PENDING',
      title: 'A clear title',
      text: '**A useful** post\n\nTest ! ![👤](tg://emoji?id=6030537299408725010)',
      format: 'Known group',
      category: 'Known hypothesis',
      imageUrl: 'https://media.example/ready.jpg',
      mediaReadiness: 'READY',
      costs: { planning: null, text: null, image: '0', review: null },
    });
    expect(gateway.execute.mock.calls[2][0].input).toContain(
      'Proposed authored post text (without configured ending or hashtags): **A useful** post',
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
      'Include 1–3 relevant hashtags for the configured placement.',
    );
    expect(gateway.execute.mock.calls[1][0].input).toContain(
      'Use 2–3 relevant emojis in a normal-length post, distributed through its body',
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

  it('generates the requested three image-ready captions with Telegram-safe length and emoji rules', async () => {
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue({
      configuration: {
        imageMode: 'ai',
        imageReferenceUrls: ['https://media.example/reference.jpg'],
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
    const replies = [
      '{"topics":["Distinct topic about emotions","Distinct topic about habits","Distinct topic about boundaries"]}',
      ...Array.from({ length: 3 }, (_, index) => [
        JSON.stringify({
          title: `A short title ${index}`,
          text: `A useful and concise post about topic ${index}.`,
          ...(index === 1 ? {} : { imagePrompt: 'Editorial illustration' }),
        }),
        '{"approved":true,"reasons":[]}',
      ]).flat(),
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
        prompt: 'Editorial illustration for Distinct topic about habits',
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
      '{"title":"A title","text":"A short caption","imagePrompt":"Editorial illustration","imageSearchQuery":"illustration","imageStyleIndex":0,"format":"standard","category":"general"}',
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
    expect(result.generated[0].mediaReadiness).toBe('READY');
    const textRequests = gateway.execute.mock.calls.filter(
      ([request]) => request.category === 'TELEGRAM_POSTING_TEXT',
    );
    expect(textRequests).toHaveLength(2);
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
      '{"title":"A revised title","text":"A revised short caption","imagePrompt":"Editorial illustration","imageSearchQuery":"illustration","imageStyleIndex":0,"format":"standard","category":"general"}',
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
    expect(result.generated[0].title).toBe('A revised title');
    expect(result.generated[0].mediaReadiness).toBe('READY');
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

    const result = await service.generate('user-1', 'channel-1', 1);

    const publication = result.generated[0];
    expect(publication.title).toBe('A clear title');
    expect(publication.text).toBe('A useful post');
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
      expect.objectContaining({ imageMode: 'ai' }),
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
      imageUrl: null,
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

  it('uses references attached to the preference selected for that draft', async () => {
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue({
      configuration: {
        imageMode: 'ai',
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
    expect(textRequest?.input).toContain('Рисованная схема');
    expect(textRequest?.input).toContain('Тёплая палитра и простая композиция');
    expect(images.prepareReferenceSheet).toHaveBeenCalledWith([
      'https://media.example/illustration.jpg',
    ]);
    expect(images.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceImage: Buffer.from('selected-preference-reference'),
      }),
    );
  });
});
