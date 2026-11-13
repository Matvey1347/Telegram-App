import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TelegramAiPostingService } from './telegram-ai-posting.service';

describe('TelegramAiPostingService', () => {
  const workspace = {
    resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('ws-a'),
  };
  const prisma = {
    telegramChannel: { findFirst: jest.fn(), findMany: jest.fn() },
    telegramPost: { findMany: jest.fn() },
    telegramAiPostingSettings: {
      findFirst: jest.fn(),
      upsert: jest.fn().mockResolvedValue({
        id: 'settings-a',
        configurationVersion: 1,
        configuration: {},
        autopilotEnabled: false,
      }),
    },
    telegramAiPostingSettingsVersion: {
      create: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
      callback(prisma),
    ),
  };
  const service = new TelegramAiPostingService(
    prisma as never,
    workspace as never,
  );
  beforeEach(() => jest.clearAllMocks());
  it('checks a source from the unsaved form', async () => {
    prisma.telegramChannel.findFirst.mockResolvedValue({ id: 'ch-a' });
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue(null);
    const collector = {
      checkWebSource: jest
        .fn()
        .mockResolvedValue({ ok: true, message: 'Лента доступна.' }),
    };
    const serviceWithCollector = new TelegramAiPostingService(
      prisma as never,
      workspace as never,
      collector as never,
    );
    await expect(
      serviceWithCollector.checkSource('user-a', 'ch-a', 'new', {
        type: 'rss',
        value: 'https://example.org/feed',
      }),
    ).resolves.toEqual({ ok: true, message: 'Лента доступна.' });
    expect(collector.checkWebSource).toHaveBeenCalledWith(
      'rss',
      'https://example.org/feed',
    );
  });
  const configuration = (sources: unknown[] = []) => ({
    historyMode: 'all',
    hashtags: 'disabled',
    imageMode: 'found',
    sources,
    categories: [],
    formats: [],
  });

  it('uses channel language and niche as defaults and leaves autopilot off', async () => {
    prisma.telegramChannel.findFirst.mockResolvedValue({
      id: 'ch-a',
      language: 'ru',
      niche: 'Tech',
      shortDescription: 'Founders',
    });
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue(null);
    const result = await service.get('user-a', 'ch-a');
    expect(prisma.telegramChannel.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ch-a', workspaceId: 'ws-a' } }),
    );
    expect(result).toMatchObject({
      configured: false,
      autopilotEnabled: false,
      detectedLanguage: 'ru',
      configuration: {
        language: '',
        topic: 'Tech',
        audience: 'Founders',
        historyMode: 'all',
      },
    });
  });

  it('rejects a channel outside the active workspace', async () => {
    prisma.telegramChannel.findFirst.mockResolvedValue(null);
    await expect(service.get('user-a', 'other-channel')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('detects language from recent channel posts when channel metadata is blank', async () => {
    prisma.telegramChannel.findFirst.mockResolvedValue({
      id: 'ch-a',
      language: '',
      niche: null,
      shortDescription: null,
    });
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue(null);
    prisma.telegramPost.findMany.mockResolvedValue([
      {
        text: 'Сьогодні поговоримо про наші емоції та звички. Дякуємо, що ви з нами!',
        formattedText: null,
      },
      {
        text: 'Як підтримати себе у складний день? Діліться думками.',
        formattedText: null,
      },
    ]);

    const result = await service.get('user-a', 'ch-a');

    expect(prisma.telegramPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'ws-a',
          telegramChannelId: 'ch-a',
          OR: [{ text: { not: null } }, { formattedText: { not: null } }],
        },
        take: 30,
      }),
    );
    expect(result.detectedLanguage).toBe('uk');
  });

  it('maps legacy editorial fields into the single channel description', async () => {
    prisma.telegramChannel.findFirst.mockResolvedValue({
      id: 'ch-a',
      language: 'ru',
      niche: 'Психология',
      shortDescription: 'Для взрослых',
    });
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue({
      configuration: {
        topic: 'Психология',
        audience: 'Для взрослых',
        style: 'Просто',
        instructions: 'Без морализаторства',
      },
    });
    prisma.telegramPost.findMany.mockResolvedValue([]);

    const result = await service.get('user-a', 'ch-a');

    expect(result.configuration.channelDescription).toContain(
      'Тематика: Психология',
    );
    expect(result.configuration.channelDescription).toContain(
      'Аудитория: Для взрослых',
    );
    expect(result.configuration.channelDescription).toContain('Стиль: Просто');
    expect(result.configuration.channelDescription).toContain(
      'Без морализаторства',
    );
  });

  it('limits Telegram idea sources to owned channels in the active workspace', async () => {
    prisma.telegramChannel.findFirst.mockResolvedValue({ id: 'ch-a' });
    prisma.telegramChannel.findMany.mockResolvedValue([]);

    await service.sourceChannels('user-a', 'ch-a');

    expect(prisma.telegramChannel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'ws-a',
          id: { not: 'ch-a' },
          adminLinks: { some: {} },
        }),
        select: expect.objectContaining({ photoUrl: true }),
      }),
    );
  });

  it('keeps autopilot disabled on first save, regardless of omitted toggle', async () => {
    prisma.telegramChannel.findFirst.mockResolvedValue({ id: 'ch-a' });
    prisma.telegramAiPostingSettings.upsert.mockResolvedValue({
      id: 'settings-a',
      configurationVersion: 1,
      configuration: {},
      autopilotEnabled: false,
    });
    const configuration = {
      historyMode: 'all',
      hashtags: 'disabled',
      imageMode: 'found',
      sources: [],
      categories: [],
      formats: [],
    };
    await service.save('user-a', 'ch-a', { configuration });
    expect(prisma.telegramAiPostingSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          workspaceId: 'ws-a',
          autopilotEnabled: false,
        }),
      }),
    );
    expect(prisma.telegramAiPostingSettingsVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          settingsId: 'settings-a',
          version: 1,
          changeSource: 'manual',
        }),
      }),
    );
  });

  it('accepts an enabled Telegram source when it satisfies the discovery policy', async () => {
    prisma.telegramChannel.findFirst.mockResolvedValue({ id: 'ch-a' });
    prisma.telegramChannel.findMany.mockResolvedValue([
      { id: 'source-channel' },
    ]);
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue(null);
    prisma.telegramAiPostingSettings.upsert.mockResolvedValue({});

    await service.save('user-a', 'ch-a', {
      configuration: configuration([
        {
          id: 'source-1',
          type: 'telegram',
          value: 'source-channel',
          enabled: true,
        },
      ]),
    });

    expect(prisma.telegramChannel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'ws-a',
          isActive: true,
          id: { not: 'ch-a', in: ['source-channel'] },
          adminLinks: { some: {} },
        },
        select: { id: true },
      }),
    );
    expect(prisma.telegramAiPostingSettings.upsert).toHaveBeenCalled();
  });

  it.each([
    [
      'another workspace',
      {
        id: 'source-channel',
        workspaceId: 'ws-b',
        isActive: true,
        admin: true,
      },
    ],
    [
      'inactive',
      {
        id: 'source-channel',
        workspaceId: 'ws-a',
        isActive: false,
        admin: true,
      },
    ],
    [
      'the target channel itself',
      { id: 'ch-a', workspaceId: 'ws-a', isActive: true, admin: true },
    ],
    [
      'without an admin link',
      {
        id: 'source-channel',
        workspaceId: 'ws-a',
        isActive: true,
        admin: false,
      },
    ],
  ])(
    'removes an enabled Telegram source that is %s',
    async (_case, candidate) => {
      prisma.telegramChannel.findFirst.mockResolvedValue({ id: 'ch-a' });
      prisma.telegramChannel.findMany.mockImplementation(
        async ({ where }: any) => {
          const matches =
            candidate.workspaceId === where.workspaceId &&
            candidate.isActive === where.isActive &&
            candidate.id !== where.id.not &&
            where.id.in.includes(candidate.id) &&
            candidate.admin === (where.adminLinks.some !== undefined);
          return matches ? [{ id: candidate.id }] : [];
        },
      );

      const result = await service.save('user-a', 'ch-a', {
        configuration: configuration([
          {
            id: 'source-1',
            type: 'telegram',
            value: candidate.id === 'ch-a' ? 'ch-a' : 'source-channel',
            enabled: true,
          },
        ]),
      });
      expect(result.sourceCleanup.removed).toEqual([
        expect.objectContaining({ type: 'telegram' }),
      ]);
      expect(prisma.telegramAiPostingSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            configuration: expect.objectContaining({ sources: [] }),
          }),
        }),
      );
    },
  );

  it('removes malformed enabled Telegram source identifiers before querying channels', async () => {
    prisma.telegramChannel.findFirst.mockResolvedValue({ id: 'ch-a' });

    const result = await service.save('user-a', 'ch-a', {
      configuration: configuration([
        {
          id: 'source-1',
          type: 'telegram',
          value: 'not a channel id',
          enabled: true,
        },
      ]),
    });
    expect(prisma.telegramChannel.findMany).not.toHaveBeenCalled();
    expect(result.sourceCleanup.removed[0]).toMatchObject({
      value: 'not a channel id',
    });
    expect(prisma.telegramAiPostingSettings.upsert).toHaveBeenCalled();
  });

  it('removes inaccessible RSS sources during settings save and reports them', async () => {
    prisma.telegramChannel.findFirst.mockResolvedValue({ id: 'ch-a' });
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue(null);
    prisma.telegramAiPostingSettings.upsert.mockResolvedValue({
      configuration: {},
    });
    const collector = {
      checkWebSource: jest.fn().mockResolvedValue({
        ok: false,
        available: false,
        message: 'RSS недоступен.',
      }),
    };
    const serviceWithCollector = new TelegramAiPostingService(
      prisma as never,
      workspace as never,
      collector as never,
    );

    const result = await serviceWithCollector.save('user-a', 'ch-a', {
      configuration: configuration([
        {
          id: 'rss-1',
          type: 'rss',
          value: 'https://example.org/feed',
          enabled: true,
        },
      ]),
    });

    expect(collector.checkWebSource).toHaveBeenCalledWith(
      'rss',
      'https://example.org/feed',
    );
    expect(result.sourceCleanup).toMatchObject({
      checkedCount: 1,
      removed: [
        expect.objectContaining({ id: 'rss-1', reason: 'RSS недоступен.' }),
      ],
    });
    expect(prisma.telegramAiPostingSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          configuration: expect.objectContaining({ sources: [] }),
        }),
      }),
    );
  });

  it('does not reject a disabled Telegram source with an old or malformed identifier', async () => {
    prisma.telegramChannel.findFirst.mockResolvedValue({ id: 'ch-a' });
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue(null);
    prisma.telegramAiPostingSettings.upsert.mockResolvedValue({});

    await service.save('user-a', 'ch-a', {
      configuration: configuration([
        {
          id: 'source-1',
          type: 'telegram',
          value: 'invalid source id',
          enabled: false,
        },
      ]),
    });

    expect(prisma.telegramChannel.findMany).not.toHaveBeenCalled();
    expect(prisma.telegramAiPostingSettings.upsert).toHaveBeenCalled();
  });

  it('checks Telegram source eligibility instead of exposing channel availability', async () => {
    prisma.telegramChannel.findFirst
      .mockResolvedValueOnce({ id: 'ch-a' })
      .mockResolvedValueOnce(null);
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue({
      configuration: {
        sources: [
          {
            id: 'source-1',
            type: 'telegram',
            value: 'source-channel',
            enabled: true,
          },
        ],
      },
    });

    const result = await service.checkSource('user-a', 'ch-a', 'source-1');

    expect(result.ok).toBe(false);
    expect(result.message).toContain('unavailable or not eligible');
    expect(prisma.telegramChannel.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'ws-a',
          isActive: true,
          id: { not: 'ch-a', in: ['source-channel'] },
          adminLinks: { some: {} },
        },
        select: { id: true },
      }),
    );
  });

  it('requires a date for history since a date', async () => {
    prisma.telegramChannel.findFirst.mockResolvedValue({ id: 'ch-a' });
    await expect(
      service.save('user-a', 'ch-a', {
        configuration: {
          historyMode: 'since',
          hashtags: 'disabled',
          imageMode: 'found',
          sources: [],
          categories: [],
          formats: [],
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('limits saved visual references to four safe image URLs', async () => {
    prisma.telegramChannel.findFirst.mockResolvedValue({ id: 'ch-a' });
    const base = {
      historyMode: 'all',
      hashtags: 'disabled',
      imageMode: 'ai',
      sources: [],
      categories: [],
      formats: [],
    };
    await expect(
      service.save('user-a', 'ch-a', {
        configuration: {
          ...base,
          imageReferenceUrls: Array.from(
            { length: 5 },
            (_, index) => `https://cdn.example/ref-${index}.jpg`,
          ),
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.save('user-a', 'ch-a', {
        configuration: {
          ...base,
          imageReferenceUrls: ['javascript:alert(1)'],
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
